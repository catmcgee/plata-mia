package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	jww "github.com/spf13/jwalterweatherman"
	"gitlab.com/elixxir/client/v4/cmix"
	"gitlab.com/elixxir/client/v4/cmix/rounds"
	"gitlab.com/elixxir/client/v4/collective/versioned"
	"gitlab.com/elixxir/client/v4/dm"
	"gitlab.com/elixxir/client/v4/notifications"
	"gitlab.com/elixxir/client/v4/xxdk"
	"gitlab.com/elixxir/crypto/codename"
	"gitlab.com/elixxir/crypto/message"
)

func main() {
	cfg := loadConfig()
	setLogLevel(cfg.LogLevel)
	jww.INFO.Printf("Starting xx proxy with state %s", cfg.StatePath)

	ndf, err := loadOrDownloadNDF(cfg)
	if err != nil {
		log.Fatalf("failed to load NDF: %v", err)
	}

	if err := ensureState(ndf, cfg); err != nil {
		log.Fatalf("failed to initialise state: %v", err)
	}

	net, err := xxdk.LoadCmix(cfg.StatePath, []byte(cfg.Password), xxdk.GetDefaultCMixParams())
	if err != nil {
		log.Fatalf("failed to load cmix state: %v", err)
	}

	store := newInboxStore()

	dmClient, receiver, err := initDMClient(net, store, cfg.StorageKey)
	if err != nil {
		log.Fatalf("failed to init dm client: %v", err)
	}

	server := &proxyServer{
		cfg:       cfg,
		net:       net,
		dmClient:  dmClient,
		store:     store,
		selfPub:   convertToEd25519(dmClient.GetPublicKey()),
		selfToken: dmClient.GetToken(),
		receiver:  receiver,
	}

	if err := server.startNetwork(); err != nil {
		log.Fatalf("failed to start network follower: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", server.handleHealth)
	mux.HandleFunc("/api/messages", server.handleMessages)
	mux.HandleFunc("/api/send-self", server.handleSendSelf)
	mux.HandleFunc("/notify/stealth-payment", server.handleNotifyStealthPayment)
	mux.HandleFunc("/notify/invoice-paid", server.handleNotifyInvoicePaid)

	log.Printf("xx proxy listening on %s", cfg.ListenAddr)
	if err := http.ListenAndServe(cfg.ListenAddr, logRequest(mux)); err != nil {
		log.Fatalf("proxy exited: %v", err)
	}
}

type proxyServer struct {
	cfg       config
	net       *xxdk.Cmix
	dmClient  dm.Client
	store     *inboxStore
	selfPub   ed25519.PublicKey
	selfToken uint32
	receiver  *receiver
}

func (s *proxyServer) startNetwork() error {
	if err := s.net.StartNetworkFollower(5 * time.Second); err != nil {
		return err
	}

	connected := make(chan bool, 10)
	s.net.GetCmix().AddHealthCallback(func(isConnected bool) {
		connected <- isConnected
	})

	if err := waitUntilConnected(connected, 30*time.Second); err != nil {
		return err
	}

	return waitForRegistration(s.net, 0.85)
}

func (s *proxyServer) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"ok": true,
	})
}

func (s *proxyServer) handleMessages(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"messages": s.store.List(),
	})
}

func (s *proxyServer) handleSendSelf(w http.ResponseWriter, r *http.Request) {
	type sendRequest struct {
		Text string `json:"text"`
	}

	var payload sendRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	text := strings.TrimSpace(payload.Text)
	if text == "" {
		text = "Hello from Plata Mia 👋"
	}

	_, _, _, err := s.dmClient.SendText(
		s.selfPub,
		s.selfToken,
		text,
		cmix.GetDefaultCMIXParams(),
	)
	if err != nil {
		jww.ERROR.Printf("failed to send dm: %+v", err)
		http.Error(w, "xx proxy failed to deliver message", http.StatusBadGateway)
		return
	}

	writeJSON(w, map[string]any{"ok": true})
}

type stealthPaymentNotification struct {
	XXUserID    string `json:"xxUserId"`
	StealthID   string `json:"stealthId"`
	Asset       string `json:"asset"`
	Amount      string `json:"amount"`
	OriginChain *int   `json:"originChainId"`
	TxHash      string `json:"txHash"`
}

type invoicePaidNotification struct {
	XXUserID    string `json:"xxUserId"`
	StealthID   string `json:"stealthId"`
	InvoiceID   string `json:"invoiceId"`
	Asset       string `json:"asset"`
	Amount      string `json:"amount"`
	OriginChain *int   `json:"originChainId"`
	TxHash      string `json:"txHash"`
}

func (s *proxyServer) handleNotifyStealthPayment(w http.ResponseWriter, r *http.Request) {
	var payload stealthPaymentNotification
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if payload.XXUserID == "" || payload.StealthID == "" || payload.Asset == "" || payload.Amount == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	message := buildStealthPaymentMessage(payload)
	if err := s.sendNotificationMessage(message); err != nil {
		jww.ERROR.Printf("failed to send stealth payment notification: %+v", err)
		http.Error(w, "failed to send notification", http.StatusBadGateway)
		return
	}

	writeJSON(w, map[string]any{"ok": true})
}

func (s *proxyServer) handleNotifyInvoicePaid(w http.ResponseWriter, r *http.Request) {
	var payload invoicePaidNotification
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if payload.XXUserID == "" || payload.StealthID == "" || payload.InvoiceID == "" || payload.Asset == "" || payload.Amount == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}

	message := buildInvoicePaidMessage(payload)
	if err := s.sendNotificationMessage(message); err != nil {
		jww.ERROR.Printf("failed to send invoice notification: %+v", err)
		http.Error(w, "failed to send notification", http.StatusBadGateway)
		return
	}

	writeJSON(w, map[string]any{"ok": true})
}

func (s *proxyServer) sendNotificationMessage(text string) error {
	_, _, _, err := s.dmClient.SendText(
		s.selfPub,
		s.selfToken,
		text,
		cmix.GetDefaultCMIXParams(),
	)
	return err
}

func buildStealthPaymentMessage(payload stealthPaymentNotification) string {
	builder := &strings.Builder{}
	fmt.Fprintln(builder, "Stealth deposit confirmed")
	fmt.Fprintf(builder, "User: %s\n", payload.XXUserID)
	fmt.Fprintf(builder, "Asset / Amount: %s %s\n", payload.Amount, payload.Asset)
	fmt.Fprintf(builder, "Stealth bucket: %s\n", payload.StealthID)
	if payload.OriginChain != nil {
		fmt.Fprintf(builder, "Origin chain: %d\n", *payload.OriginChain)
	}
	if payload.TxHash != "" {
		fmt.Fprintf(builder, "Tx hash: %s\n", payload.TxHash)
	}
	fmt.Fprintln(builder)
	return builder.String()
}

func buildInvoicePaidMessage(payload invoicePaidNotification) string {
	builder := &strings.Builder{}
	fmt.Fprintln(builder, "🛍️ Invoice settled from stealth balance")
	fmt.Fprintf(builder, "User: %s\n", payload.XXUserID)
	fmt.Fprintf(builder, "Invoice: %s\n", payload.InvoiceID)
	fmt.Fprintf(builder, "Stealth bucket: %s\n", payload.StealthID)
	fmt.Fprintf(builder, "Asset / Amount: %s %s\n", payload.Amount, payload.Asset)
	if payload.OriginChain != nil {
		fmt.Fprintf(builder, "Origin chain: %d\n", *payload.OriginChain)
	}
	if payload.TxHash != "" {
		fmt.Fprintf(builder, "Tx hash: %s\n", payload.TxHash)
	}
	fmt.Fprintln(builder)
	fmt.Fprintln(builder, "Merchant now has PAS on-chain. Leftover stealth funds stay in your bucket.")
	fmt.Fprintln(builder, "Need to withdraw fiat-side? Use Inbox → On-chain inbox when you're ready.")
	return builder.String()
}

// --- configuration helpers ---

type config struct {
	ListenAddr  string
	StatePath   string
	Password    string
	NDFPath     string
	NDFURL      string
	Certificate string
	StorageKey  string
	LogLevel    uint
}

func loadConfig() config {
	return config{
		ListenAddr:  getEnv("XX_PROXY_LISTEN", ":8787"),
		StatePath:   getEnv("XX_PROXY_STATE_PATH", "./xxproxy-state"),
		Password:    getEnv("XX_PROXY_STATE_PASSWORD", "Hello"),
		NDFPath:     getEnv("XX_PROXY_NDF_PATH", "./xxproxy.ndf"),
		NDFURL:      getEnv("XX_PROXY_NDF_URL", "https://elixxir-bins.s3.us-west-1.amazonaws.com/ndf/mainnet.json"),
		Certificate: getEnv("XX_PROXY_CERT_PATH", "./mainnet.crt"),
		StorageKey:  getEnv("XX_PROXY_STORAGE_KEY", "xxproxy-dm-id"),
		LogLevel:    parseUint(getEnv("XX_PROXY_LOG_LEVEL", "1"), 1),
	}
}

func setLogLevel(level uint) {
	switch {
	case level == 0:
		jww.SetStdoutThreshold(jww.LevelTrace)
	case level == 1:
		jww.SetStdoutThreshold(jww.LevelDebug)
	case level == 2:
		jww.SetStdoutThreshold(jww.LevelInfo)
	case level == 3:
		jww.SetStdoutThreshold(jww.LevelWarn)
	case level == 4:
		jww.SetStdoutThreshold(jww.LevelError)
	case level == 5:
		jww.SetStdoutThreshold(jww.LevelCritical)
	default:
		jww.SetStdoutThreshold(jww.LevelFatal)
	}
}

func parseUint(value string, fallback uint) uint {
	u, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return fallback
	}
	return uint(u)
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// --- state + network bootstrap ---

func loadOrDownloadNDF(cfg config) (string, error) {
	if _, err := os.Stat(cfg.NDFPath); err == nil {
		data, err := os.ReadFile(cfg.NDFPath)
		if err != nil {
			return "", err
		}
		return string(data), nil
	}

	cert, err := os.ReadFile(cfg.Certificate)
	if err != nil {
		return "", fmt.Errorf("failed to read certificate: %w", err)
	}

	ndf, err := xxdk.DownloadAndVerifySignedNdfWithUrl(cfg.NDFURL, string(cert))
	if err != nil {
		return "", fmt.Errorf("failed to download NDF: %w", err)
	}

	if err := os.WriteFile(cfg.NDFPath, ndf, 0o600); err != nil {
		return "", err
	}

	return string(ndf), nil
}

func ensureState(ndf string, cfg config) error {
	if stat, err := os.Stat(cfg.StatePath); err == nil && stat.IsDir() {
		return nil
	}
	if err := os.MkdirAll(cfg.StatePath, 0o700); err != nil {
		return err
	}
	return xxdk.NewCmix(ndf, cfg.StatePath, []byte(cfg.Password), "")
}

func initDMClient(net *xxdk.Cmix, store *inboxStore, storageKey string) (dm.Client, *receiver, error) {
	kv := net.GetStorage().GetKV()
	dmID, err := loadOrCreateDMIdentity(kv, net, storageKey)
	if err != nil {
		return nil, nil, err
	}

	receiver := newReceiver(store)
	nickMgr := dm.NewNicknameManager(net.GetStorage().GetReceptionID(), kv)
	sendTracker := dm.NewSendTracker(kv)
	transmissionID := net.GetTransmissionIdentity()
	signature := net.GetStorage().GetTransmissionRegistrationValidationSignature()
	notificationsMgr := notifications.NewOrLoadManager(
		transmissionID,
		signature,
		kv,
		&notifications.MockComms{},
		net.GetRng(),
	)

	client, err := dm.NewDMClient(&dmID, receiver, sendTracker, nickMgr, notificationsMgr, net.GetCmix(), kv, net.GetRng(), nil)
	if err != nil {
		return nil, nil, err
	}

	return client, receiver, nil
}

func loadOrCreateDMIdentity(kv versioned.KV, net *xxdk.Cmix, storageKey string) (codename.PrivateIdentity, error) {
	record, err := kv.Get(storageKey, 0)
	if err == nil {
		return codename.UnmarshalPrivateIdentity(record.Data)
	}

	if err != nil && kv.Exists(err) {
		return codename.PrivateIdentity{}, err
	}

	stream := net.GetRng().GetStream()
	defer stream.Close()

	dmID, err := codename.GenerateIdentity(stream)
	if err != nil {
		return codename.PrivateIdentity{}, err
	}

	if err := kv.Set(storageKey, &versioned.Object{
		Version:   0,
		Timestamp: time.Now(),
		Data:      dmID.Marshal(),
	}); err != nil {
		return codename.PrivateIdentity{}, err
	}

	return dmID, nil
}

func convertToEd25519(pub interface{ Bytes() []byte }) ed25519.PublicKey {
	bytes := pub.Bytes()
	cp := make([]byte, len(bytes))
	copy(cp, bytes)
	return ed25519.PublicKey(cp)
}

func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}

// --- HTTP helpers ---

func logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode JSON", http.StatusInternalServerError)
	}
}

// --- inbox storage + receiver bridge ---

type InboxMessage struct {
	ID        string    `json:"id"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
	Sender    string    `json:"sender"`
}

type inboxStore struct {
	mu       sync.RWMutex
	messages []InboxMessage
}

func newInboxStore() *inboxStore {
	return &inboxStore{
		messages: make([]InboxMessage, 0, 64),
	}
}

func (s *inboxStore) Add(msg InboxMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.messages) > 0 {
		last := s.messages[len(s.messages)-1]
		if last.Text == msg.Text &&
			last.Sender == msg.Sender &&
			absDuration(last.Timestamp.Sub(msg.Timestamp)) < time.Second {
			return
		}
	}

	s.messages = append(s.messages, msg)
	if len(s.messages) > 200 {
		s.messages = s.messages[len(s.messages)-200:]
	}
}

func (s *inboxStore) List() []InboxMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]InboxMessage, len(s.messages))
	copy(out, s.messages)
	return out
}

type receiver struct {
	recv    chan message.ID
	msgData map[message.ID]*msgInfo
	uuid    uint64
	store   *inboxStore
	sync.Mutex
}

type msgInfo struct {
	messageID  message.ID
	replyID    message.ID
	nickname   string
	content    string
	partnerKey ed25519.PublicKey
	senderKey  ed25519.PublicKey
	dmToken    uint32
	codeset    uint8
	timestamp  time.Time
	round      rounds.Round
	mType      dm.MessageType
	status     dm.Status
	uuid       uint64
}

func newReceiver(store *inboxStore) *receiver {
	return &receiver{
		recv:    make(chan message.ID, 10),
		msgData: make(map[message.ID]*msgInfo),
		store:   store,
	}
}

func (r *receiver) receive(messageID message.ID, replyID message.ID,
	nickname, text string, partnerKey, senderKey ed25519.PublicKey,
	dmToken uint32,
	codeset uint8, timestamp time.Time,
	round rounds.Round, mType dm.MessageType, status dm.Status) uint64 {
	r.Lock()
	defer r.Unlock()
	msg, ok := r.msgData[messageID]
	if !ok {
		r.uuid++
		msg = &msgInfo{
			messageID:  messageID,
			replyID:    replyID,
			nickname:   nickname,
			content:    text,
			partnerKey: partnerKey,
			senderKey:  senderKey,
			dmToken:    dmToken,
			codeset:    codeset,
			timestamp:  timestamp,
			round:      round,
			mType:      mType,
			status:     status,
			uuid:       r.uuid,
		}
		r.msgData[messageID] = msg
		r.store.Add(InboxMessage{
			ID:        fmt.Sprintf("%v", messageID),
			Text:      text,
			Timestamp: timestamp,
			Sender:    base64.RawStdEncoding.EncodeToString(senderKey),
		})
	} else {
		msg.status = status
	}
	go func() { r.recv <- messageID }()
	return msg.uuid
}

func (r *receiver) Receive(messageID message.ID,
	nickname string, text []byte, partnerKey, senderKey ed25519.PublicKey,
	dmToken uint32,
	codeset uint8, timestamp time.Time,
	round rounds.Round, mType dm.MessageType, status dm.Status) uint64 {
	return r.receive(messageID, message.ID{}, nickname, string(text),
		partnerKey, senderKey, dmToken, codeset, timestamp, round, mType, status)
}

func (r *receiver) ReceiveText(messageID message.ID,
	nickname, text string, partnerKey, senderKey ed25519.PublicKey,
	dmToken uint32,
	codeset uint8, timestamp time.Time,
	round rounds.Round, status dm.Status) uint64 {
	return r.receive(messageID, message.ID{}, nickname, text,
		partnerKey, senderKey, dmToken, codeset, timestamp, round,
		dm.TextType, status)
}

func (r *receiver) ReceiveReply(messageID message.ID,
	reactionTo message.ID, nickname, text string,
	partnerKey, senderKey ed25519.PublicKey, dmToken uint32, codeset uint8,
	timestamp time.Time, round rounds.Round,
	status dm.Status) uint64 {
	return r.receive(messageID, reactionTo, nickname, text,
		partnerKey, senderKey, dmToken, codeset, timestamp, round,
		dm.TextType, status)
}

func (r *receiver) ReceiveReaction(messageID message.ID,
	reactionTo message.ID, nickname, reaction string,
	partnerKey, senderKey ed25519.PublicKey, dmToken uint32, codeset uint8,
	timestamp time.Time, round rounds.Round,
	status dm.Status) uint64 {
	return r.receive(messageID, reactionTo, nickname, reaction,
		partnerKey, senderKey, dmToken, codeset, timestamp, round,
		dm.ReactionType,
		status)
}

func (r *receiver) UpdateSentStatus(_ uint64, messageID message.ID,
	timestamp time.Time, round rounds.Round, status dm.Status) {
	r.Lock()
	defer r.Unlock()
	msg, ok := r.msgData[messageID]
	if !ok {
		return
	}
	msg.status = status
}

func (r *receiver) DeleteMessage(message.ID, ed25519.PublicKey) bool {
	return true
}

func (r *receiver) GetConversation(ed25519.PublicKey) *dm.ModelConversation {
	return nil
}

func (r *receiver) GetConversations() []dm.ModelConversation {
	return nil
}

// --- network helpers ---

func waitUntilConnected(connected chan bool, timeout time.Duration) error {
	timeoutTimer := time.NewTimer(timeout)
	defer timeoutTimer.Stop()

	for {
		select {
		case isConnected := <-connected:
			if isConnected {
				return nil
			}
		case <-timeoutTimer.C:
			return errors.New("timeout waiting for network follower")
		}
	}
}

func waitForRegistration(user *xxdk.Cmix, threshold float32) error {
	for {
		numReg, total, err := user.GetNodeRegistrationStatus()
		if err != nil {
			return err
		}
		if total == 0 {
			time.Sleep(1 * time.Second)
			continue
		}
		if float32(numReg) >= threshold*float32(total) {
			return nil
		}
		time.Sleep(1 * time.Second)
	}
}

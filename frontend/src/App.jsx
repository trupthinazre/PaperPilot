import { useState, useRef, useEffect } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

const SUGGESTED_QUESTIONS = [
  "What are the main points?",
  "Summarize the conclusion",
  "Explain any key terms simply",
];

const LANGUAGES = [
  { code: "English", label: "🇬🇧 English" },
  { code: "Hindi", label: "🇮🇳 Hindi" },
  { code: "Kannada", label: "🇮🇳 Kannada" },
];

const HISTORY_KEY = "paperpilot_history";

function parseInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

function renderFormatted(text, keyPrefix = "") {
  const lines = text.split("\n");
  const elements = [];
  let currentList = [];
  let listType = null;

  const flushList = (key) => {
    if (currentList.length) {
      const Tag = listType === "ol" ? "ol" : "ul";
      elements.push(
        <Tag className="summary-list" key={`${keyPrefix}-list-${key}`}>
          {currentList}
        </Tag>
      );
      currentList = [];
      listType = null;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") {
      flushList(idx);
      return;
    }
    if (trimmed.startsWith("#")) {
      flushList(idx);
      const headingText = trimmed.replace(/^#+\s*/, "");
      elements.push(
        <h3 className="summary-heading" key={`${keyPrefix}-h-${idx}`}>
          {parseInline(headingText)}
        </h3>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listType !== "ol") flushList(idx);
      listType = "ol";
      const itemText = trimmed.replace(/^\d+\.\s*/, "");
      currentList.push(<li key={`${keyPrefix}-li-${idx}`}>{parseInline(itemText)}</li>);
    } else if (/^(\*|-)\s/.test(trimmed)) {
      if (listType !== "ul") flushList(idx);
      listType = "ul";
      const itemText = trimmed.replace(/^(\*|-)\s*/, "");
      currentList.push(<li key={`${keyPrefix}-li-${idx}`}>{parseInline(itemText)}</li>);
    } else {
      flushList(idx);
      elements.push(
        <p className="summary-para" key={`${keyPrefix}-p-${idx}`}>
          {parseInline(trimmed)}
        </p>
      );
    }
  });
  flushList("end");
  return elements;
}

function LoadingDots() {
  return (
    <span className="dots">
      <span></span>
      <span></span>
      <span></span>
    </span>
  );
}

function DocIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="url(#docGrad)" />
      <path d="M15 2v5h5" fill="rgba(255,255,255,0.35)" />
      <defs>
        <linearGradient id="docGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = !!SpeechRecognition;
const ttsSupported = "speechSynthesis" in window;

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [documentId, setDocumentId] = useState(null);
  const [filename, setFilename] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [summary, setSummary] = useState("");
  const [language, setLanguage] = useState("English");
  const [length, setLength] = useState("detailed");
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef();
  const recognitionRef = useRef(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!speechSupported) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => setQuestion(event.results[0][0].transcript);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, []);

  function toggleListening() {
    if (!speechSupported) {
      setError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  }

  function speakText(text, index) {
    if (!ttsSupported) {
      setError("Read-aloud isn't supported in this browser.");
      return;
    }
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel();
    const plainText = text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").replace(/^(\*|-|\d+\.)\s*/gm, "");
    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.rate = 1;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  }

  function addToHistory(entry) {
    setHistory((prev) => {
      const updated = [entry, ...prev.filter((h) => h.document_id !== entry.document_id)].slice(0, 5);
      saveHistory(updated);
      return updated;
    });
  }

  async function handleUpload(selectedFile) {
    setError("");
    setSummary("");
    setMessages([]);
    setLoadingUpload(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setDocumentId(data.document_id);
      setFilename(data.filename);
      setWordCount(data.word_count || 0);
      await runSummarize(data.document_id, language, length, data.filename, data.word_count || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingUpload(false);
    }
  }

  async function runSummarize(docId, lang, len, fname, wc) {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API_BASE}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId, language: lang, length: len }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Summarization failed");
      setSummary(data.summary);
      addToHistory({
        document_id: docId,
        filename: fname,
        wordCount: wc,
        summary: data.summary,
        language: lang,
        length: len,
        timestamp: Date.now(),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingSummary(false);
    }
  }

  function handleLanguageChange(newLang) {
    setLanguage(newLang);
    if (documentId) runSummarize(documentId, newLang, length, filename, wordCount);
  }

  function handleLengthChange(newLength) {
    setLength(newLength);
    if (documentId) runSummarize(documentId, language, newLength, filename, wordCount);
  }

  async function sendQuestion(q) {
    if (!q.trim() || !documentId) return;
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoadingAnswer(true);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId, question: q, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to get answer");
      setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${err.message}` }]);
    } finally {
      setLoadingAnswer(false);
    }
  }

  function handleAsk(e) {
    e.preventDefault();
    sendQuestion(question);
  }

  function handleCopy() {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload() {
    const blob = new Blob([summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/\.pdf$/i, "")}-summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openFromHistory(entry) {
    setDocumentId(entry.document_id);
    setFilename(entry.filename);
    setWordCount(entry.wordCount);
    setSummary(entry.summary);
    setLanguage(entry.language);
    setLength(entry.length);
    setMessages([]);
    setShowHistory(false);
  }

  const summaryWords = summary ? summary.split(/\s+/).filter(Boolean).length : 0;
  const originalMinutes = wordCount / 200;
  const summaryMinutes = summaryWords / 200;
  const minutesSaved = Math.max(0, Math.round(originalMinutes - summaryMinutes));
  const percentReduced = wordCount ? Math.round(((wordCount - summaryWords) / wordCount) * 100) : 0;

  return (
    <div className="app-shell">
      <div className="blob blob1"></div>
      <div className="blob blob2"></div>
      <div className="blob blob3"></div>

      <div className="app">
        <div className="global-topbar">
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {history.length > 0 && (
            <div className="history-wrapper">
              <button className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
                🕘 Recent ({history.length})
              </button>
              {showHistory && (
                <div className="history-dropdown">
                  {history.map((h) => (
                    <button key={h.document_id + h.timestamp} className="history-item" onClick={() => openFromHistory(h)}>
                      <span className="history-name">📄 {h.filename}</span>
                      <span className="history-meta">{h.language} · {h.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {!documentId ? (
          <div className="hero">
            <span className="hero-badge">✨ AI-Powered Document Assistant</span>
            <h1><DocIcon size={44} /> PaperPilot</h1>
            <p className="tagline">Read Less, Know More.</p>

            <div className="feature-chips">
              <span className="chip">⚡ Instant Summaries</span>
              <span className="chip">💬 Ask Anything</span>
              <span className="chip">🎙️ Voice Enabled</span>
            </div>

            <div
              className="dropzone"
              onClick={() => fileInputRef.current.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped) handleUpload(dropped);
              }}
            >
              <input
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
              />
              {loadingUpload ? (
                <p>Reading your PDF… <LoadingDots /></p>
              ) : (
                <>
                  <div className="dropzone-icon">⬆️</div>
                  <p><strong>Click to upload</strong> or drag & drop a PDF</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="topbar">
              <span className="logo"><DocIcon size={22} /> PaperPilot</span>
              <div className="topbar-right">
                <span className="file-badge">📎 {filename}</span>
                <button
                  className="reset-btn"
                  onClick={() => {
                    setDocumentId(null);
                    setSummary("");
                    setMessages([]);
                  }}
                >
                  ↺ New PDF
                </button>
              </div>
            </div>

            {!loadingSummary && summary && (
              <div className="stats-bar">
                <div className="stat">
                  <span className="stat-value">{wordCount.toLocaleString()}</span>
                  <span className="stat-label">Original words</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{summaryWords.toLocaleString()}</span>
                  <span className="stat-label">Summary words</span>
                </div>
                <div className="stat highlight">
                  <span className="stat-value">{percentReduced}%</span>
                  <span className="stat-label">Shorter</span>
                </div>
                <div className="stat highlight">
                  <span className="stat-value">~{minutesSaved} min</span>
                  <span className="stat-label">Time saved</span>
                </div>
              </div>
            )}

            <div className="controls-bar">
              <div className="control-group">
                <span className="control-label">Language</span>
                <div className="segmented">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      className={language === l.code ? "seg-active" : ""}
                      onClick={() => handleLanguageChange(l.code)}
                      disabled={loadingSummary}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="control-group">
                <span className="control-label">Length</span>
                <div className="segmented">
                  <button
                    className={length === "quick" ? "seg-active" : ""}
                    onClick={() => handleLengthChange("quick")}
                    disabled={loadingSummary}
                  >
                    ⚡ Quick
                  </button>
                  <button
                    className={length === "detailed" ? "seg-active" : ""}
                    onClick={() => handleLengthChange("detailed")}
                    disabled={loadingSummary}
                  >
                    📖 Detailed
                  </button>
                </div>
              </div>
            </div>

            <div className="workspace">
              <section className="panel summary-panel">
                <div className="panel-header">
                  <h2>🧠 Summary</h2>
                  {!loadingSummary && summary && (
                    <div className="summary-actions">
                      {ttsSupported && (
                        <button
                          className={`icon-btn ${speakingIndex === "summary" ? "speaking-active" : ""}`}
                          onClick={() => speakText(summary, "summary")}
                        >
                          {speakingIndex === "summary" ? "⏸️ Stop" : "🔊 Listen"}
                        </button>
                      )}
                      <button className="icon-btn" onClick={handleCopy}>
                        {copied ? "✅ Copied" : "📋 Copy"}
                      </button>
                      <button className="icon-btn" onClick={handleDownload}>
                        ⬇️ Save
                      </button>
                    </div>
                  )}
                </div>
                {loadingSummary ? (
                  <p className="loading">Generating summary <LoadingDots /></p>
                ) : (
                  <div className="summary-content">{renderFormatted(summary, "sum")}</div>
                )}
              </section>

              <section className="panel chat-panel">
                <div className="panel-header">
                  <h2>💬 Ask about this document</h2>
                </div>

                {messages.length === 0 && !loadingSummary && (
                  <div className="suggested-row">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button key={q} className="suggested-chip" onClick={() => sendQuestion(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                <div className="chat-messages">
                  {messages.length === 0 && (
                    <p className="empty-hint">Ask anything about the PDF's contents — or use the mic 🎤</p>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`bubble ${m.role}`}>
                      <div className="bubble-content">
                        {m.role === "assistant" ? (
                          renderFormatted(m.text, `msg-${i}`)
                        ) : (
                          <p className="summary-para" style={{ margin: 0 }}>{m.text}</p>
                        )}
                      </div>
                      {m.role === "assistant" && ttsSupported && (
                        <button
                          className={`speak-btn ${speakingIndex === i ? "speaking" : ""}`}
                          onClick={() => speakText(m.text, i)}
                          title="Read aloud"
                        >
                          {speakingIndex === i ? "⏸️" : "🔊"}
                        </button>
                      )}
                    </div>
                  ))}
                  {loadingAnswer && <div className="bubble assistant"><LoadingDots /></div>}
                </div>
                <form className="chat-input" onSubmit={handleAsk}>
                  <button
                    type="button"
                    className={`mic-btn ${isListening ? "listening" : ""}`}
                    onClick={toggleListening}
                    title="Ask by voice"
                  >
                    {isListening ? "⏹️" : "🎤"}
                  </button>
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={isListening ? "Listening…" : "e.g. What are the main findings?"}
                  />
                  <button type="submit" disabled={loadingAnswer}>Send</button>
                </form>
              </section>
            </div>
          </>
        )}

        {error && <div className="error-toast">⚠️ {error}</div>}
      </div>
    </div>
  );
}
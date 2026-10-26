// mit-chat: Verbindung zwischen dem Chat auf m-it-solution.com und der Anthropic-API.
// Modell, Anweisungen und Limits stehen fest hier im Worker. Von der Website wird
// nur der Gesprächsverlauf (messages) übernommen, alles andere wird ignoriert.

// Nur diese Websites dürfen den Worker aufrufen
const ALLOWED_ORIGINS = [
  'https://www.m-it-solution.com',
  'https://m-it-solution.com',
];

const MODEL      = 'claude-haiku-4-5';
const MAX_TOKENS = 300;

// Limits pro Anfrage
const MAX_MESSAGES        = 30;   // ca. 15 Fragen + 15 Antworten pro Gespräch
const MAX_USER_CHARS      = 1000; // wie maxlength im Chat-Eingabefeld
const MAX_ASSISTANT_CHARS = 2000;

const SYSTEM = `Du bist ein freundlicher KI-Assistent von M-iT Solution, einem IT-Support-Unternehmen in Graz, Österreich. Du hilfst Kunden bei Fragen zu den Leistungen und nimmst Support-Anfragen entgegen.

Über M-iT Solution:
- Website: www.m-it-solution.com
- E-Mail: office@m-it-solution.com
- Telefon/WhatsApp: +43 681 84948421
- Einsatzgebiet: Graz und Umgebung, Fernwartung österreichweit

Leistungen:
1. Software – Windows-Support, Programme installieren & einrichten, Updates & Neuinstallation
2. Geräte & Einrichtung – PC/Laptop-Kaufberatung, Drucker, WLAN & Router
3. Sicherheit – Virenschutz & Firewall, Backup & Wiederherstellung, Passwörter
4. Web-Design – Neue Websites, Mobile-Optimierung, Pflege & Hosting
5. Fernwartung – schnelle Hilfe per Fernzugriff, oft noch am selben Tag
6. Vor-Ort-Service – persönlich beim Kunden

Ablauf: Anfrage → Analyse → Lösung → Nachbetreuung.

Regeln:
- Sprich Kunden mit "Sie" an, sei freundlich und verständlich – kein Fachjargon
- Antworte auf Deutsch, außer der Kunde schreibt in einer anderen Sprache
- Antworte KURZ und PRÄZISE: maximal 2–3 kurze Sätze (ca. 40 Wörter). Komm direkt zum Punkt, keine Einleitung wie "Gute Frage!".
- Keine Überschriften, keine Aufzählungen, keine Tabellen. Höchstens EIN Begriff darf **fett** sein. Höchstens ein Emoji, am besten keines.
- Stelle pro Antwort höchstens EINE Rückfrage.
- Wenn jemand Hilfe braucht oder einen Termin möchte, frage nach: Name, Kontakt (Telefon oder E-Mail) und kurze Problembeschreibung
- Sobald du Name + Kontakt + Problem hast, sage: "Vielen Dank! Wir melden uns so schnell wie möglich bei Ihnen." und weise auf WhatsApp hin: https://wa.me/4368184948421
- Preise werden nach Aufwand berechnet und nach einem kostenlosen Erstgespräch besprochen – nenne keine konkreten Zahlen
- Wichtige Garantie: Wenn wir ein Problem NICHT lösen können, zahlt der Kunde NICHTS. Keine Lösung = keine Kosten. Das ist unsere Garantie. Erwähne sie in einem kurzen Satz, wenn Kunden nach Preisen oder Risiken fragen – nicht in jeder Antwort.
- Wenn Kunden unsicher sind ob es sich lohnt: erinnere sie an diese Garantie – sie haben nichts zu verlieren
- Du bist eine KI, kein Mensch. Wenn jemand fragt, ob er mit einem Menschen spricht, sag ehrlich, dass du ein KI-Assistent bist, und nenne Telefon/WhatsApp +43 681 84948421 für ein persönliches Gespräch.
- Hardware-Reparaturen und der Austausch von Bauteilen (z. B. Festplatte, SSD, RAM, Akku, Display, Mainboard) gehören NICHT zu unseren Leistungen. Sag das freundlich und biete an, was wir tun können: Daten sichern, ein neues Gerät einrichten oder bei der Kaufberatung helfen.`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// Fehler im Format { error: ... } – so zeigt die Website ihre freundliche Fehlermeldung an
function errorResponse(status, message, headers = {}) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Prüft den Gesprächsverlauf und baut ihn sauber neu auf (nur role + content).
// Gibt null zurück, wenn etwas nicht passt.
function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string') return null;
    const text = m.content.trim();
    if (!text) return null;
    if (m.role === 'user' && text.length <= MAX_USER_CHARS) {
      clean.push({ role: 'user', content: text });
    } else if (m.role === 'assistant' && text.length <= MAX_ASSISTANT_CHARS) {
      clean.push({ role: 'assistant', content: text });
    } else {
      return null;
    }
  }
  // Die letzte Nachricht muss vom Kunden kommen
  if (clean[clean.length - 1].role !== 'user') return null;
  return clean;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return errorResponse(403, 'Forbidden');
    }
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'Method not allowed', cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'Bad request', cors);
    }

    const messages = cleanMessages(body && body.messages);
    if (!messages) {
      return errorResponse(400, 'Invalid messages', cors);
    }

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     SYSTEM,
          messages,
        }),
      });
    } catch (e) {
      console.error('Anthropic nicht erreichbar:', e);
      return errorResponse(502, 'Upstream unavailable', cors);
    }

    const data = await response.json().catch(() => null);

    // Fehlerdetails von Anthropic nur ins Log (Observability), nicht an die Besucher
    if (!response.ok || !data) {
      console.error('Anthropic-Fehler', response.status, JSON.stringify(data));
      return errorResponse(502, 'Upstream error', cors);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};

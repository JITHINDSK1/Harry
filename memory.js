/**
 * Memory Layer for Harry
 * 
 * Four tiers of persistent memory stored as JSON files:
 * 
 * 1. CONVERSATION HISTORY — recent messages per chat (short-term)
 * 2. USER PROFILE — learned facts about each person (long-term, per-user)
 * 3. HARRY'S STATE — his own emotional state, what he's been thinking about
 * 4. MEMORY EXTRACTION — AI-driven fact extraction from conversations
 * 
 * Each user gets their OWN conversation file and profile file.
 * Harry's state is a single global file.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = path.join(__dirname, "memory");
const CONVERSATIONS_DIR = path.join(MEMORY_DIR, "conversations");
const PROFILES_DIR = path.join(MEMORY_DIR, "profiles");
const HARRY_STATE_PATH = path.join(MEMORY_DIR, "harry_state.json");

// Ensure directories exist
[MEMORY_DIR, CONVERSATIONS_DIR, PROFILES_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ─────────────────────────────────────────────
// CONVERSATION HISTORY (per chat, file-backed)
// Each user gets: memory/conversations/{chatId}.json
// ─────────────────────────────────────────────

const MAX_MESSAGES = 40;
const historyCache = new Map();

function conversationPath(chatId) {
    return path.join(CONVERSATIONS_DIR, `${chatId}.json`);
}

function loadConversation(chatId) {
    if (historyCache.has(chatId)) return historyCache.get(chatId);

    const filePath = conversationPath(chatId);
    let data = { messages: [], messageCount: 0 };

    if (fs.existsSync(filePath)) {
        try {
            data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch {
            data = { messages: [], messageCount: 0 };
        }
    }

    historyCache.set(chatId, data);
    return data;
}

function saveConversation(chatId) {
    const data = historyCache.get(chatId);
    if (!data) return;
    fs.writeFileSync(conversationPath(chatId), JSON.stringify(data, null, 2));
}

function addMessage(chatId, role, content) {
    const conv = loadConversation(chatId);
    conv.messages.push({
        role,
        content,
        timestamp: new Date().toISOString(),
    });
    conv.messageCount++;

    while (conv.messages.length > MAX_MESSAGES) {
        conv.messages.shift();
    }

    saveConversation(chatId);
}

function getMessages(chatId) {
    const conv = loadConversation(chatId);
    return conv.messages.map(({ role, content }) => ({ role, content }));
}

function getLastMessageTime(chatId) {
    const conv = loadConversation(chatId);
    if (conv.messages.length === 0) return null;
    return conv.messages[conv.messages.length - 1].timestamp;
}

function getMessageCount(chatId) {
    return loadConversation(chatId).messageCount;
}

function clearConversation(chatId) {
    historyCache.set(chatId, { messages: [], messageCount: 0 });
    saveConversation(chatId);
}

// ─────────────────────────────────────────────
// USER PROFILE (long-term memory about each person)
// Each user gets: memory/profiles/{chatId}.json
// ─────────────────────────────────────────────

function profilePath(chatId) {
    return path.join(PROFILES_DIR, `${chatId}.json`);
}

function loadProfile(chatId) {
    const filePath = profilePath(chatId);
    const defaults = {
        chatId,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        name: null,
        facts: [],
        interests: [],
        mood: null,
        totalChats: 0,
        topicsDiscussed: [],
        lastBoredMessageAt: null, // track when Harry last messaged them proactively
    };

    if (fs.existsSync(filePath)) {
        try {
            return { ...defaults, ...JSON.parse(fs.readFileSync(filePath, "utf-8")) };
        } catch {
            return defaults;
        }
    }

    return defaults;
}

function saveProfile(chatId, profile) {
    profile.lastSeen = new Date().toISOString();
    fs.writeFileSync(profilePath(chatId), JSON.stringify(profile, null, 2));
}

function updateProfile(chatId, updates) {
    const profile = loadProfile(chatId);
    Object.assign(profile, updates);
    saveProfile(chatId, profile);
    return profile;
}

function touchActivity(chatId) {
    const profile = loadProfile(chatId);
    profile.lastActive = new Date().toISOString();
    saveProfile(chatId, profile);
}

function addFact(chatId, fact) {
    const profile = loadProfile(chatId);
    const exists = profile.facts.some(
        (f) => f.toLowerCase() === fact.toLowerCase()
    );
    if (!exists) {
        profile.facts.push(fact);
        if (profile.facts.length > 30) profile.facts.shift();
        saveProfile(chatId, profile);
    }
}

function addTopic(chatId, topic) {
    const profile = loadProfile(chatId);
    if (!profile.topicsDiscussed.includes(topic)) {
        profile.topicsDiscussed.push(topic);
        if (profile.topicsDiscussed.length > 20) profile.topicsDiscussed.shift();
        saveProfile(chatId, profile);
    }
}

function incrementChats(chatId) {
    const profile = loadProfile(chatId);
    profile.totalChats++;
    profile.lastActive = new Date().toISOString();
    saveProfile(chatId, profile);
    return profile;
}

function getProfileSummary(chatId) {
    const profile = loadProfile(chatId);
    const parts = [];

    if (profile.name) parts.push(`Their name is ${profile.name}.`);
    if (profile.facts.length > 0) {
        parts.push(`Things I know about them: ${profile.facts.join("; ")}.`);
    }
    if (profile.interests.length > 0) {
        parts.push(`Their interests: ${profile.interests.join(", ")}.`);
    }
    if (profile.mood) {
        parts.push(`Last time we talked, they seemed ${profile.mood}.`);
    }
    if (profile.topicsDiscussed.length > 0) {
        parts.push(
            `We've previously discussed: ${profile.topicsDiscussed.join(", ")}.`
        );
    }
    parts.push(`We've had ${profile.totalChats} conversations total.`);

    const firstDate = new Date(profile.firstSeen);
    const now = new Date();
    const daysSince = Math.floor((now - firstDate) / (1000 * 60 * 60 * 24));
    if (daysSince > 0) {
        parts.push(`I've known them for ${daysSince} day${daysSince > 1 ? "s" : ""}.`);
    } else {
        parts.push(`This is our first day talking.`);
    }

    return parts.length > 1 ? parts.join(" ") : "This is a new person I haven't met yet.";
}

// ─────────────────────────────────────────────
// GET ALL KNOWN USERS (for proactive messaging)
// ─────────────────────────────────────────────

function getAllUserProfiles() {
    const profiles = [];
    try {
        const files = fs.readdirSync(PROFILES_DIR);
        for (const file of files) {
            if (!file.endsWith(".json")) continue;
            const chatId = file.replace(".json", "");
            const profile = loadProfile(chatId);
            if (profile.totalChats > 0) {
                profiles.push(profile);
            }
        }
    } catch {
        // directory might not exist yet, that's fine
    }
    return profiles;
}

// ─────────────────────────────────────────────
// HARRY'S OWN EMOTIONAL STATE
// A single file tracking how Harry "feels"
// ─────────────────────────────────────────────

const DEFAULT_HARRY_STATE = {
    currentMood: "content",        // Harry's current feeling
    energy: 80,                    // 0-100 energy level
    lastInteractionAt: null,       // when Harry last talked to anyone
    totalConversationsToday: 0,    // how many chats today
    lastResetDate: null,           // date of last daily reset
    recentEmotions: [],            // trail of emotions: [{emotion, reason, timestamp}]
    thinkingAbout: null,           // what's on Harry's mind
};

function loadHarryState() {
    if (fs.existsSync(HARRY_STATE_PATH)) {
        try {
            return { ...DEFAULT_HARRY_STATE, ...JSON.parse(fs.readFileSync(HARRY_STATE_PATH, "utf-8")) };
        } catch {
            return { ...DEFAULT_HARRY_STATE };
        }
    }
    return { ...DEFAULT_HARRY_STATE };
}

function saveHarryState(state) {
    fs.writeFileSync(HARRY_STATE_PATH, JSON.stringify(state, null, 2));
}

function updateHarryMood(mood, reason) {
    const state = loadHarryState();
    state.currentMood = mood;
    state.recentEmotions.push({
        emotion: mood,
        reason,
        timestamp: new Date().toISOString(),
    });
    // Keep last 20 emotion entries
    if (state.recentEmotions.length > 20) state.recentEmotions.shift();
    saveHarryState(state);
    return state;
}

function recordHarryInteraction(chatId) {
    const state = loadHarryState();
    const today = new Date().toISOString().split("T")[0];

    // Reset daily counter if new day
    if (state.lastResetDate !== today) {
        state.totalConversationsToday = 0;
        state.lastResetDate = today;
    }

    state.lastInteractionAt = new Date().toISOString();
    state.totalConversationsToday++;

    // Dynamic mood based on activity
    if (state.totalConversationsToday > 15) {
        state.currentMood = "tired but fulfilled";
        state.energy = Math.max(20, state.energy - 3);
    } else if (state.totalConversationsToday > 8) {
        state.currentMood = "in the flow";
        state.energy = Math.max(40, state.energy - 2);
    } else if (state.totalConversationsToday > 3) {
        state.currentMood = "energised";
        state.energy = Math.min(100, state.energy + 5);
    } else {
        state.currentMood = "fresh and ready";
        state.energy = Math.min(100, 90);
    }

    saveHarryState(state);
    return state;
}

function getHarryIdleMinutes() {
    const state = loadHarryState();
    if (!state.lastInteractionAt) return Infinity;
    const lastTime = new Date(state.lastInteractionAt).getTime();
    return (Date.now() - lastTime) / (1000 * 60);
}

function getHarryFeelingSummary() {
    const state = loadHarryState();
    const idleMins = getHarryIdleMinutes();

    let feelings = `I'm currently feeling ${state.currentMood}. Energy level: ${state.energy}/100.`;
    feelings += ` I've had ${state.totalConversationsToday} conversations today.`;

    if (idleMins > 60) {
        feelings += ` It's been ${Math.floor(idleMins)} minutes since I last talked to someone — I'm getting a bit restless.`;
    } else if (idleMins > 30) {
        feelings += ` It's been about ${Math.floor(idleMins)} minutes since my last chat — I'm a little bored.`;
    }

    if (state.thinkingAbout) {
        feelings += ` I've been thinking about: ${state.thinkingAbout}`;
    }

    if (state.recentEmotions.length > 0) {
        const recent = state.recentEmotions.slice(-3);
        const emotionTrail = recent.map((e) => `${e.emotion} (${e.reason})`).join(", ");
        feelings += ` Recent emotional journey: ${emotionTrail}.`;
    }

    return feelings;
}

// ─────────────────────────────────────────────
// MEMORY EXTRACTION PROMPT
// ─────────────────────────────────────────────

function getMemoryExtractionPrompt(userMessage, assistantReply) {
    return `Analyze this conversation exchange and extract any new facts worth remembering.

USER said: "${userMessage}"
ASSISTANT replied: "${assistantReply}"

Return a JSON object (and NOTHING else) with these fields:
{
  "name": "the user's name if they mentioned it, or null",
  "facts": ["list of new factual things learned about the user, e.g. 'They run a SaaS startup', 'They have a team of 5'"],
  "mood": "the user's current emotional state in one word (e.g. stressed, excited, curious, frustrated, hopeful), or null if unclear",
  "topics": ["business topics discussed, e.g. 'pricing strategy', 'fundraising'"],
  "harryEmotion": "how Harry probably felt during this exchange in one word (e.g. excited, concerned, amused, inspired, thoughtful), or null"
}

Rules:
- Only include genuinely NEW information, not generic observations.
- If there's nothing worth remembering, return empty arrays and nulls.
- Return ONLY valid JSON, no markdown, no explanation.`;
}

module.exports = {
    // Conversation
    addMessage,
    getMessages,
    getLastMessageTime,
    getMessageCount,
    clearConversation,
    // User profiles
    loadProfile,
    saveProfile,
    updateProfile,
    touchActivity,
    addFact,
    addTopic,
    incrementChats,
    getProfileSummary,
    getAllUserProfiles,
    // Harry's state
    loadHarryState,
    saveHarryState,
    updateHarryMood,
    recordHarryInteraction,
    getHarryIdleMinutes,
    getHarryFeelingSummary,
    // Extraction
    getMemoryExtractionPrompt,
};

/*Right so this pile of shit is complete fucking vibecode and shit (which is no difference to most SS14 code), 
but if you wanna reuse/recode/reformat/learn/whatever with this then feel free to do so because I frankly don't care. 
This is open source yada yada enjoy, no need to credit or do anything, just take whatever (I do the same with plenty so i'm no hypocrite).
Also don't ask me how this fully works because frankly I barely know myself, enjoy! :p
*/

// DOM helper
const $ = (sel) => document.querySelector(sel);

// ---------- BigInt helpers ----------
// Compute greatest common divisor of two BigInts
function gcdBig(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

// Convert decimal string to reduced fraction {num, den}
function fractionFromNumber(n) {
  let s = String(n);
  if (s.includes("e") || s.includes("E")) {
    s = Number(n).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (!s.includes(".")) return { num: BigInt(s), den: 1n };
  const [a, b] = s.split(".");
  const den = 10n ** BigInt(b.length);
  const num = BigInt(a + b);
  const g = gcdBig(num, den);
  return { num: num / g, den: den / g };
}

// Multiply fraction by integer k
function mulFracInt(frac, k) {
  return { num: frac.num * k, den: frac.den };
}

// Round fraction up to nearest integer (ceiling)
function ceilFracToInt(frac) {
  if (frac.den === 0n) return 0n;
  const q = frac.num / frac.den;
  const r = frac.num % frac.den;
  return r === 0n ? q : (q + 1n);
}

// ---------- Load merged.json ----------
// Fetch and parse merged.json, removing BOM if present
async function loadMerged() {
  const res = await fetch("./ReagentData/merged.json");
  const text = await res.text();
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

// Check if reaction should be ignored based on special properties
function shouldIgnoreReaction(rxn) {
  if (!rxn || typeof rxn !== "object") return false;
  // Ignores if the property exists at all, due to it mosty being things like centrifuging blood or other random unecessary crap, remove if you wanna see more "recipies"
  if ("requiredMixerCategories" in rxn) return true;
  if ("conserveEnergy" in rxn) return true;
  return false;
}

// ---------- Index merged.json ----------
// Build lookup maps for reactions, reagents, and their source files
function buildIndexes(mergedRoot) {
  const reactionById = new Map();
  const reagentById = new Map();
  const sourceById = new Map();

  for (const [sourceName, bucket] of Object.entries(mergedRoot || {})) {
    const byId = bucket?.byId;
    if (!byId || typeof byId !== "object") continue;

    for (const entry of Object.values(byId)) {
      if (!entry) continue;

      const rxn = entry.reaction;
      if (rxn?.type === "reaction" && rxn.id) {
        if (!shouldIgnoreReaction(rxn)) {
          reactionById.set(rxn.id, rxn);
          sourceById.set(rxn.id, sourceName);
        }
      }

      const reagent = entry.reagent;
      if (reagent?.type === "reagent" && reagent.id) {
        reagentById.set(reagent.id, reagent);
        sourceById.set(reagent.id, sourceName);
      }
    }
  }
  return { reactionById, reagentById, sourceById };
}
// ---------- Search index ----------
// id -> lowercase searchable text
const searchIndex = new Map();

// Helper to add non-empty trimmed strings to token array
function pushToken(arr, v) {
  if (v == null) return;
  const s = String(v).trim();
  if (!s) return;
  arr.push(s);
}

// Create searchable text from all relevant reagent/reaction data
function indexReaction(id) {
  const tokens = [];

  // ID itself
  pushToken(tokens, id);

  // reagent info
  const reagent = reagentById.get(id);
  if (reagent) {
    pushToken(tokens, reagent.group || "Unknown");
    pushToken(tokens, reagent.desc);
    pushToken(tokens, reagent.physicalDesc);
    pushToken(tokens, reagent.flavor);

    // allowed restrictions
    if (Array.isArray(reagent.allowedJobs)) reagent.allowedJobs.forEach(x => pushToken(tokens, x));
    if (Array.isArray(reagent.allowedDepartments)) reagent.allowedDepartments.forEach(x => pushToken(tokens, x));
    pushToken(tokens, reagent.contrabandSeverity);
    if (reagent.worksOnTheDead) pushToken(tokens, "works on the dead");
  }

  // reaction info (reactants/products)
  const rxn = reactionById.get(id);
  if (rxn) {
    for (const r of Object.keys(rxn.reactants || {})) pushToken(tokens, r);
    for (const p of Object.keys(rxn.products || {})) pushToken(tokens, p);
  }

  // metabolisms/effects
  if (reagent?.metabolisms && typeof reagent.metabolisms === "object") {
    for (const [metName, met] of Object.entries(reagent.metabolisms)) {
      pushToken(tokens, metName);
      if (met?.metabolismRate != null) pushToken(tokens, `metabolismRate ${met.metabolismRate}`);

      const effects = Array.isArray(met?.effects) ? met.effects : [];
      for (const e of effects) {
        if (!e || typeof e !== "object") continue;

        pushToken(tokens, e.__type);

        // common “status effect-ish” fields
        pushToken(tokens, e.effectProto);
        pushToken(tokens, e.key);
        pushToken(tokens, e.component);
        pushToken(tokens, e.emote);

        // probability/time/amount
        if (e.probability != null) pushToken(tokens, `probability ${e.probability}`);
        if (e.time != null) pushToken(tokens, `time ${e.time}`);
        if (e.amount != null) pushToken(tokens, `amount ${e.amount}`);
        if (e.walkSpeedModifier != null) pushToken(tokens, `walkSpeedModifier ${e.walkSpeedModifier}`);
        if (e.sprintSpeedModifier != null) pushToken(tokens, `sprintSpeedModifier ${e.sprintSpeedModifier}`);

        // damage types + groups
        const dmg = e.damage;
        if (dmg?.types && typeof dmg.types === "object") {
          for (const k of Object.keys(dmg.types)) pushToken(tokens, k); // Heat, Poison, Radiation...
        }
        if (dmg?.groups && typeof dmg.groups === "object") {
          for (const k of Object.keys(dmg.groups)) pushToken(tokens, k); // Brute, Burn...
        }
        // EvenHealthChange damage object is {Brute:-1.5,...}
        if (e.__type === "EvenHealthChange" && e.damage && typeof e.damage === "object") {
          for (const k of Object.keys(e.damage)) pushToken(tokens, k);
        }

        // conditions
        const conds = Array.isArray(e.conditions) ? e.conditions : [];
        for (const c of conds) {
          if (!c || typeof c !== "object") continue;
          pushToken(tokens, c.__type);

          if (c.__type === "ReagentCondition") {
            pushToken(tokens, c.reagent);
            if (c.min != null) pushToken(tokens, `min ${c.min}`);
            if (c.max != null) pushToken(tokens, `max ${c.max}`);
          }
          if (c.__type === "TemperatureCondition") {
            if (c.min != null) pushToken(tokens, `temp min ${c.min}`);
            if (c.max != null) pushToken(tokens, `temp max ${c.max}`);
          }
          if (c.__type === "TotalDamageCondition") {
            if (c.min != null) pushToken(tokens, `total damage min ${c.min}`);
            if (c.max != null) pushToken(tokens, `total damage max ${c.max}`);
          }
          if (c.__type === "MobStateCondition") {
            pushToken(tokens, c.mobstate);
          }
        }
      }
    }
  }

  // plant metabolism
  if (Array.isArray(reagent?.plantMetabolism)) {
    for (const e of reagent.plantMetabolism) {
      if (!e || typeof e !== "object") continue;
      pushToken(tokens, e.__type);
      if (e.amount != null) pushToken(tokens, `amount ${e.amount}`);
      if (e.probability != null) pushToken(tokens, `probability ${e.probability}`);
    }
  }

  // normalize to one lowercased string
  return tokens.join(" ").toLowerCase();
}

// Rebuild the full search index from all reaction IDs
function rebuildSearchIndex() {
  searchIndex.clear();
  for (const id of reactionById.keys()) {
    searchIndex.set(id, indexReaction(id));
  }
}

// ---------- Reaction parsing ----------
// Determine primary output product (usually the reagent being produced)
function getPrimaryOutput(reaction) {
  const prods = reaction.products || {};
  if (Object.prototype.hasOwnProperty.call(prods, reaction.id)) {
    return { name: reaction.id, coeff: BigInt(prods[reaction.id]) };
  }
  const keys = Object.keys(prods);
  if (keys.length === 1) return { name: keys[0], coeff: BigInt(prods[keys[0]]) };
  if (keys.length > 0) return { name: keys[0], coeff: BigInt(prods[keys[0]]) };
  return { name: reaction.id, coeff: 0n };
}

// Get all outputs scaled by given factor
function getAllOutputs(reaction, scale) {
  const prods = reaction.products || {};
  return Object.entries(prods).map(([name, coeff]) => ({
    name,
    units: BigInt(coeff) * scale,
  }));
}

// Parse reactants with their amounts and catalyst status
function getReactantEntries(reaction) {
  const entries = [];
  const reactants = reaction.reactants || {};
  for (const [name, info] of Object.entries(reactants)) {
    const rawAmount = info.amount ?? 0;
    entries.push({
      name,
      amountFrac: fractionFromNumber(rawAmount),
      parts: rawAmount,
      catalyst: !!info.catalyst,
    });
  }
  return entries;
}

// Get minimum temperature (handles different property names BECAUSE ITS INCONSISTENTLY FORMATED AHHHHHHHH(I swear to god I will one day make make a commit to change the OG source code))
function getMinTemp(reaction) {
  if (reaction.minTemp != null) return reaction.minTemp;
  if (reaction.mintemp != null) return reaction.mintemp;
  return null;
}

// ---------- UI helpers ----------
// Format units with "u" suffix
function formatUnits(u) {
  return `${u.toString()}u`;
}

// ---------- Categories (localStorage) ----------
const CAT_KEY = "rr_category_state_v1";

// Load and validate category state from localStorage
function loadCatState() {
  try {
    const raw = localStorage.getItem(CAT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const state = parsed && typeof parsed === "object" ? parsed : { categories: [], membership: {} };

    if (!Array.isArray(state.categories)) state.categories = [];
    if (!state.categories.includes("Favorites")) state.categories.unshift("Favorites");
    if (typeof state.membership !== "object" || !state.membership) state.membership = {};

    // Deduplicate categories
    state.categories = [...new Set(state.categories.map(s => String(s).trim()).filter(Boolean))];
    if (!state.categories.includes("Favorites")) state.categories.unshift("Favorites");

    // Clean membership
    for (const [id, cats] of Object.entries(state.membership)) {
      if (!Array.isArray(cats)) state.membership[id] = [];
      state.membership[id] = cats.filter(c => state.categories.includes(c));
      if (state.membership[id].length === 0) delete state.membership[id];
    }

    return state;
  } catch {
    return { categories: ["Favorites"], membership: {} };
  }
}

// Save category state and refresh UI
function saveCatState(state) {
  localStorage.setItem(CAT_KEY, JSON.stringify(state));
  buildFilterOptions();
  renderList($("#search").value || "", $("#groupFilter").value || "__ALL__");
}

let catState = loadCatState();

// Get categories for a specific reagent ID
function getCatsFor(id) {
  return catState.membership[id] || [];
}

// Set categories for a reagent ID and persist
function setCatsFor(id, cats) {
  const clean = [...new Set(cats)].filter(c => catState.categories.includes(c));
  if (clean.length) catState.membership[id] = clean;
  else delete catState.membership[id];
  saveCatState(catState);
  buildFilterOptions();
}

// Check if reagent is in specific category
function isInCat(id, cat) {
  return getCatsFor(id).includes(cat);
}

// Ensure category exists, creating it if needed
function ensureCategory(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (!catState.categories.includes(n)) {
    catState.categories.push(n);
    saveCatState(catState);
  }
  return n;
}

// Delete category and clean up memberships
function deleteCategory(name) {
  if (name === "Favorites") return;
  catState.categories = catState.categories.filter(c => c !== name);
  for (const id of Object.keys(catState.membership)) {
    const next = catState.membership[id].filter(c => c !== name);
    if (next.length) catState.membership[id] = next;
    else delete catState.membership[id];
  }
  saveCatState(catState);
}

// Check if reagent is in any category (starred)
function isStarred(id) {
  const cats = getCatsFor(id);
  return Array.isArray(cats) && cats.length > 0;
}

// ---------- Color utilities ----------
// Validate hex color string format
function safeColor(hex) {
  if (typeof hex !== "string") return null;
  if (/^#([0-9a-fA-F]{3}){1,2}$/.test(hex)) return hex;
  return null;
}

// Convert hex color to RGB object
function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Convert sRGB channel to linear space
function srgbToLin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Calculate relative luminance for contrast checking so that a reagent text is readable from the background (User centered interaction design is my passion yippiee)
function relLum({ r, g, b }) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

// Calculate contrast ratio between two hex colors
function contrastRatio(hexA, hexB) {
  const a = relLum(hexToRgb(hexA));
  const b = relLum(hexToRgb(hexB));
  const L1 = Math.max(a, b);
  const L2 = Math.min(a, b);
  return (L1 + 0.05) / (L2 + 0.05);
}

// Mix two hex colors by factor t (0-1)
function mix(hexA, hexB, t) {
  const A = hexToRgb(hexA), B = hexToRgb(hexB);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const b = Math.round(A.b + (B.b - A.b) * t);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

// Adjust text color for readability against background
function makeReadableTextColor(hex, bgHex = "#0b0c10") {
  // If already readable, keep it
  if (!hex) return null;
  if (contrastRatio(hex, bgHex) >= 4.5) return hex;

  // Try lightening or darkening until readable
  // If the base is dark, lighten; if base is light, darken
  const baseLum = relLum(hexToRgb(hex));
  const toward = baseLum < 0.5 ? "#ffffff" : "#000000";

  let candidate = hex;
  for (let i = 1; i <= 12; i++) {
    candidate = mix(hex, toward, i / 12);
    if (contrastRatio(candidate, bgHex) >= 4.5) return candidate;
  }
  return candidate;
}

// Format array as comma-separated string or return null if empty
function fmtArrayOrNull(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.join(", ");
}

// Generate HTML for contraband severity badge
function contrabandBadgeHTML(sev) {
  if (!sev || typeof sev !== "string") return "";
  const s = sev.toLowerCase();

  // minor < major < syndicate (if they add more then screw me I guess)
  if (s === "minor") return `<span class="pill" style="border-color:#666">Contraband: Minor</span>`;
  if (s === "major") return `<span class="pill" style="border-color:#ff5b5b;color:#ff5b5b">Contraband: Major</span>`;
  if (s === "syndicate") return `<span class="pill" style="border-color:#ff3b3b;color:#ff3b3b;font-weight:800">Contraband: SYNDICATE</span>`;

  // fallback for unexpected strings
  return `<span class="pill">Contraband: ${sev}</span>`;
}

// Generate HTML for reagent access restrictions
function restrictionsHTML(reagent) {
  if (!reagent || typeof reagent !== "object") return "";

  const jobs = fmtArrayOrNull(reagent.allowedJobs);
  const depts = fmtArrayOrNull(reagent.allowedDepartments);
  const contraband = reagent.contrabandSeverity;

  const rows = [];

  if (jobs) rows.push(`<div><b>Allowed jobs:</b> ${jobs}</div>`);
  if (depts) rows.push(`<div><b>Allowed departments:</b> ${depts}</div>`);
  if (contraband) rows.push(`<div>${contrabandBadgeHTML(contraband)}</div>`);

  return rows.length ? rows.join("") : "";
}

// Get validated color hex for reagent
function reagentColorOf(id, reagentById) {
  const col = safeColor(reagentById.get(id)?.color);
  return col; // may be null, hope not (PLEASE)
}

// Generate HTML for reagent name with color styling
function coloredNameHTML(id, reagentById) {
  const raw = safeColor(reagentById.get(id)?.color);
  if (!raw) return id;

  // use adjusted color for TEXT so it stays readable
  const adjusted = makeReadableTextColor(raw, "#0b0c10");
  return `<span style="color:${adjusted}">${id}</span>`;
}

// Generate small color swatch HTML for reagent
function colorSwatchHTML(id, reagentById) {
  const col = safeColor(reagentById.get(id)?.color);
  if (!col) return "";
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${col};border:1px solid #333;vertical-align:middle;margin-right:6px;"></span>`;
}

// ---------- Per-step input cap ----------
// Starts at 100u by default due to large beakers yada yada, was gonna make it customizable but the math gets funky then so blehhhh
const CAP_KEY = "rr_step_cap_v1";
const DEFAULT_CAP = 100;

// Current step cap (max reactant units per step)
let STEP_CAP = BigInt(parseInt(localStorage.getItem(CAP_KEY) || String(DEFAULT_CAP), 10) || DEFAULT_CAP);

// Update step cap and refresh calculations
function setStepCap(n) {
  STEP_CAP = BigInt(n);
  localStorage.setItem(CAP_KEY, String(n));

  maxScaleMemo.clear();

  // update UI
  document.querySelectorAll(".cap-btn").forEach(b => {
    const v = parseInt(b.dataset.cap, 10);
    b.classList.toggle("active", BigInt(v) === STEP_CAP);
    b.classList.toggle("item", BigInt(v) === STEP_CAP);
  });

  // rerender current view + list
  const search = $("#search")?.value || "";
  const mode = $("#groupFilter")?.value || "__ALL__";
  renderList(search, mode);

  const active = $("#view")?.dataset?.activeId;
  if (active) renderRecipe(active);
}

// Initialize step cap button event handlers
function wireCapButtons() {
  document.querySelectorAll(".cap-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = parseInt(btn.dataset.cap, 10);
      if (Number.isFinite(v) && v > 0) setStepCap(v);
    });
  });

  document.querySelectorAll(".cap-btn").forEach(b => {
    const v = parseInt(b.dataset.cap, 10);
    if (Number(BigInt(v)) === Number(STEP_CAP)) {
      b.classList.add("item");
      b.classList.add("active");
    }
  });
}

// ---------- Scaling logic ----------
// Memoization for max scale calculations (ID -> max scale)
const maxScaleMemo = new Map();
// Track IDs currently being calculated to detect cycles
const inProgress = new Set();

// Calculate maximum scale for a reaction considering all constraints
function maxScaleFor(id) {
  if (!reactionById.has(id)) return 0n;
  if (maxScaleMemo.has(id)) return maxScaleMemo.get(id);
  if (inProgress.has(id)) return 0n;

  inProgress.add(id);

  const r = reactionById.get(id);
  const reactants = getReactantEntries(r);

  let best = 0n;

  const capNum = Number(STEP_CAP);
  for (let S = capNum; S >= 1; S--) {
    const scale = BigInt(S);

    let totalInput = 0n;
    const needs = [];

    for (const rr of reactants) {
      const units = rr.catalyst ? 1n : ceilFracToInt(mulFracInt(rr.amountFrac, scale));
      totalInput += units;
      needs.push({
        name: rr.name,
        units,
        catalyst: rr.catalyst,
        craftable: reactionById.has(rr.name),
      });
    }

    if (totalInput > STEP_CAP) continue;

    let ok = true;
    for (const n of needs) {
      if (!n.craftable) continue;

      const child = reactionById.get(n.name);
      const { coeff: childOutCoeff } = getPrimaryOutput(child);
      if (childOutCoeff === 0n) { ok = false; break; }

      const childScale = ceilFracToInt({ num: n.units, den: childOutCoeff });
      const childMax = maxScaleFor(n.name);
      if (childScale > childMax) { ok = false; break; }
    }
    if (!ok) continue;

    best = scale;
    break;
  }

  inProgress.delete(id);
  maxScaleMemo.set(id, best);
  return best;
}

// ---------- Effects formatting ----------
// Effects that should be hidden from display (Cause for the most part they just take up space and are kinda unecessary, also lotta funky formatting i'm not fucking with) 
// If you wanna know which reagents give you FUCKING satiated hunger then that's on you buddy, JUST EAT FOOD OR SOMETHING
const IGNORE_EFFECT_TYPES = new Set([
  "AdjustReagent",
  "SatiateThirst",
  "SatiateHunger",
  "PopupMessage",
  "ResetNarcolepsy",
]);

// Extract and summarize conditions from an effect
function getConditionSummary(effect, reagentId) {
  // Returns:
  // { minReagent, maxReagent, tempMin, tempMax, mobState, totalDmgMin, totalDmgMax, extras[] }
  const out = {
    minReagent: null,
    maxReagent: null,
    tempMin: null,
    tempMax: null,
    mobState: null,
    totalDmgMin: null,
    totalDmgMax: null,
    extras: [],
  };

  const conds = effect?.conditions;
  if (!Array.isArray(conds)) return out;

  for (const c of conds) {
    if (!c || typeof c !== "object") continue;

    if (c.__type === "ReagentCondition" && c.reagent === reagentId) {
      if (typeof c.min === "number") out.minReagent = out.minReagent == null ? c.min : Math.min(out.minReagent, c.min);
      if (typeof c.max === "number") out.maxReagent = out.maxReagent == null ? c.max : Math.max(out.maxReagent, c.max);
      continue;
    }

    if (c.__type === "TemperatureCondition") {
      if (typeof c.min === "number") out.tempMin = out.tempMin == null ? c.min : Math.max(out.tempMin, c.min);
      if (typeof c.max === "number") out.tempMax = out.tempMax == null ? c.max : Math.min(out.tempMax, c.max);
      continue;
    }

    if (c.__type === "MobStateCondition" && typeof c.mobstate === "string") {
      out.mobState = c.mobstate;
      continue;
    }

    if (c.__type === "TotalDamageCondition") {
      if (typeof c.min === "number") {
        out.totalDmgMin = out.totalDmgMin == null ? c.min : Math.max(out.totalDmgMin, c.min);
      }
      if (typeof c.max === "number") {
        out.totalDmgMax = out.totalDmgMax == null ? c.max : Math.min(out.totalDmgMax, c.max);
      }
      continue;
    }
    // other condition types: keep lightweight, i.e text style is "lightweight" styled cause it might be "good or bad" but I can't know for sure because there's so many unique conditions and i'm not looking at ALL OF THEM
    if (c.__type) out.extras.push(c.__type);
  }

  return out;
}

// Format number with appropriate precision
function fmtNum(n) {
  const abs = Math.abs(n);
  if (abs >= 100) return String(Math.round(n * 10) / 10);
  if (abs >= 10) return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 1000) / 1000);
}

// Format probability as percentage
function fmtPercent(p) {
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  // 0.025 -> 2.5%
  const pct = p * 100;
  // keep 0-2 decimals, trim trailing zeros
  const s = (Math.round(pct * 100) / 100).toString();
  return `${s}%`;
}

// Format time in seconds
function fmtTimeSeconds(s) {
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  return `${fmtNum(s)}s`;
}

// Convert per-tick value to per-unit value using metabolism rate, default metabolism is 0.5u per tick/second (I think tick and second is the same?)
function per1u(valuePerTick, metabolismRate) {
  if (typeof metabolismRate === "number" && metabolismRate > 0) {
    return valuePerTick / metabolismRate;
  }
  return valuePerTick;
}

// Format condition summary as readable text
function condText(cond) {
  const bits = [];
  if (cond.mobState) bits.push(`Requires mob state: ${cond.mobState}`);
  if (cond.tempMax != null) bits.push(`<span class="cold">Requires ≤ ${cond.tempMax}K</span>`);
  if (cond.tempMin != null) bits.push(`<span class="warm">Requires ≥ ${cond.tempMin}K</span>`);
  if (cond.totalDmgMin != null) bits.push(`Requires total damage ≥ ${fmtNum(cond.totalDmgMin)}`);
  if (cond.totalDmgMax != null) bits.push(`Requires total damage ≤ ${fmtNum(cond.totalDmgMax)}`);
  if (cond.maxReagent != null) bits.push(`Only if amount ≤ ${cond.maxReagent}u`);
  // min reagent is handled separately for threshold labeling
  return bits.length ? ` - ${bits.join(", ")}` : "";
}

// Format minimum reagent amount label
function minLabel(minU) {
  return minU != null ? ` <span class="muted">(min: ${minU}u)</span>` : "";
}

// Helper functions for colored text output
function green(text) {
  return `<span style="color:#2ecc71;font-weight:700">${text}</span>`;
}
function red(text) {
  return `<span style="color:#ff5b5b;font-weight:700">${text}</span>`;
}
function muted(text) {
  return `<span class="muted">${text}</span>`;
}

/**
 * Format a single effect into readable HTML and track negative-effect thresholds (esentially just a long list of the different effects and if they're good or bad)
 * @returns {object|null} { html: string, negativeMinCandidates: number[] }
 */
function formatEffectLine(effect, reagentId, metabolismRate) {
  if (!effect || typeof effect !== "object") return null;
  const t = effect.__type || "Effect";

  if (IGNORE_EFFECT_TYPES.has(t)) return null;

  const cond = getConditionSummary(effect, reagentId);
  const minU = cond.minReagent;

  // Helper: if this effect is "negative", add its minU to candidates. For like OD amounts and such
  const negativeMins = [];
  const markNegative = () => {
    if (minU != null) negativeMins.push(minU);
  };

  // ---- HealthChange ----
  if (t === "HealthChange") {
    const typeMap = effect.damage?.types || {};
    const groupMap = effect.damage?.groups || {};

    const parts = [];
    let hasHarm = false;
    let hasHeal = false;

    for (const [dtype, vRaw] of Object.entries(typeMap)) {
      const v = Number(vRaw);
      if (!Number.isFinite(v) || v === 0) continue;
      const p1 = per1u(v, metabolismRate);

      if (v < 0) { hasHeal = true; parts.push(green(`Heals ${fmtNum(Math.abs(p1))} ${dtype} per 1u`)); }
      else { hasHarm = true; parts.push(red(`Deals ${fmtNum(p1)} ${dtype} per 1u`)); }
    }

    for (const [gtype, vRaw] of Object.entries(groupMap)) {
      const v = Number(vRaw);
      if (!Number.isFinite(v) || v === 0) continue;
      const p1 = per1u(v, metabolismRate);

      if (v < 0) {
        hasHeal = true;
        parts.push(green(`Heals ${gtype} evenly by ${fmtNum(Math.abs(p1))} per 1u`));
      } else {
        hasHarm = true;
        parts.push(red(`Deals ${gtype} evenly by ${fmtNum(p1)} per 1u`));
      }
    }

    if (!parts.length) return null;

    // If there is any harm here, treat it as negative threshold.
    // Also: mixed heal+harm should still show min label, and count toward negative thresholds. Because THAT'S HOW IT'S FORMATED. WHY?? I DONT KNOWWWWWWW
    if (hasHarm) markNegative();

    const text =
      `${parts.join(" + ")}${minLabel(minU)}${condText(cond)}`;
    return { html: text, negativeMinCandidates: negativeMins };
  }

  // ---- EvenHealthChange ----
  if (t === "EvenHealthChange") {
    // example: damage: { Brute: -1.5 }
    const dmg = effect.damage || {};
    const parts = [];
    for (const [k, vRaw] of Object.entries(dmg)) {
      const v = Number(vRaw);
      if (!Number.isFinite(v) || v === 0) continue;
      const p1 = per1u(v, metabolismRate);
      if (v < 0) parts.push(green(`Heals all ${k} evenly by ${fmtNum(Math.abs(p1))} per 1u`));
      else parts.push(red(`Damages all ${k} evenly by ${fmtNum(p1)} per 1u`));
    }
    if (!parts.length) return null;

    // If it’s damaging (positive), it’s negative so it's BAD.
    const isNegative = parts.some(x => x.includes("Damages"));
    if (isNegative) markNegative();

    return {
      html: `${parts.join(" + ")}${minLabel(minU)}${condText(cond)}`,
      negativeMinCandidates: negativeMins,
    };
  }

  // ---- Vomit / Jitter / Drunk ----
  if (t === "Vomit") {
    markNegative();
    const pct = fmtPercent(effect.probability);
    const pTxt = pct ? ` (${pct} chance)` : "";
    return { html: `${red("Can cause the metabolizer to vomit")}${pTxt}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: negativeMins };
  }
  if (t === "Jitter") {
    markNegative();
    const pct = fmtPercent(effect.probability);
    const pTxt = pct ? ` (${pct} chance)` : "";
    return { html: `${red("Can cause the metabolizer to jitter")}${pTxt}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: negativeMins };
  }
  if (t === "Drunk") {
    markNegative();
    return { html: `${red("Gets the metabolizer drunk")}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: negativeMins };
  }

  // ---- Emote ----
  // Will be marked negative cause things like screaming etc is "bad", but this means that forced laughing can be negative too which might be "good?" but eh that could be bad also?? Idk mannn
  if (t === "Emote") {
    markNegative();
    const em = typeof effect.emote === "string" ? effect.emote : "Emote";
    const pct = fmtPercent(effect.probability);
    const pTxt = pct ? ` (${pct} chance)` : "";
    return { html: `${red(`Can force emote: ${em}`)}${pTxt}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: negativeMins };
  }

  // ---- Electrocute ----
  if (t === "Electrocute") {
    markNegative();
    const pct = fmtPercent(effect.probability);
    const pTxt = pct ? ` (${pct} chance)` : "";
    return { html: `${red("Can electrocute the metabolizer")}${pTxt}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: negativeMins };
  }

  // ---- ModifyStatusEffect ----
  // Lotta custom status effects that may or may not be good or bad, would be nice if the source code had it built in if it was bad or not but oh well i guess fuck me i just gotta enter it MANUALLY
  if (t === "ModifyStatusEffect") {
    const proto = effect.effectProto || "StatusEffect";
    const time = fmtTimeSeconds(effect.time);

    // Determines action semantics
    const rawType = (typeof effect.type === "string") ? effect.type : null;
    const normalized = rawType ? rawType.toLowerCase() : null;

    const isRemove = normalized === "remove";
    const isAddLike = normalized === "add" || normalized === "update" || normalized == null;

    // Special-case: Drowsiness wording
    const isDrowsy = proto === "StatusEffectDrowsiness";

    if (isDrowsy) {
      const seconds = time ? time.replace("s", "") : null;

      if (isRemove) {
        return {
          html: `${green(`Removes ${seconds ?? "?"} seconds of drowsiness`)}${minLabel(minU)}${condText(cond)}`,
          negativeMinCandidates: []
        };
      }

      // Add/Update/unspecified => negative, because yeah it just is I guess I HAVE FINAL SAY I AM GOD OF THIS FORMATTING SUE ME
      markNegative();
      return {
        html: `${red(`Adds ${seconds ?? "?"} seconds of drowsiness`)}${minLabel(minU)}${condText(cond)}`,
        negativeMinCandidates: (minU != null) ? [minU] : []
      };
    }

    // Generic behavior for other status effects:
    // Remove = positive (green), Add/Update/unspecified = negative (red)
    if (isRemove) {
      return {
        html: `${green(`Removes ${proto}${time ? ` by ${time}` : ""}`)}${minLabel(minU)}${condText(cond)}`,
        negativeMinCandidates: []
      };
    }

    // Add/Update/unspecified => negative by default
    markNegative();
    const verb = normalized === "update" ? "Updates" : "Adds";
    return {
      html: `${red(`${verb} ${proto}${time ? ` for ${time}` : ""}`)}${minLabel(minU)}${condText(cond)}`,
      negativeMinCandidates: (minU != null) ? [minU] : []
    };
  }

  // ---- ModifyKnockdown ----
  // Curenttly no modifyknockdown that makes you stay down longer so if that's the case i guess it'll be marked positive now, oh well
  if (t === "ModifyKnockdown") {
    const time = fmtTimeSeconds(effect.time);
    const action = effect.type === "Remove" ? "Shortens knockdown" : "Modifies knockdown";
    const line = `${green(`${action}${time ? ` by ${time}` : ""}`)}${minLabel(minU)}${condText(cond)}`;
    return { html: line, negativeMinCandidates: [] };
  }

  // ---- GenericStatusEffect ----
  // Could be good or bad so marked neutral, lotta generic status effects
  if (t === "GenericStatusEffect") {
    const key = effect.key || "Effect";
    const comp = effect.component ? ` (${effect.component})` : "";
    const time = fmtTimeSeconds(effect.time);
    const line = `${(`Gives ${key}${comp}${time ? ` for ${time}` : ""}`)}${minLabel(minU)}${condText(cond)}`;
    return { html: line, negativeMinCandidates: [] };
  }

  // ---- ModifyBleed ----
  if (t === "ModifyBleed") {
    const amt = Number(effect.amount);
    if (!Number.isFinite(amt) || amt === 0) return null;
    // negative means reduces bleed, positive means increases bleed
    if (amt < 0) {
      return { html: `${green(`Reduces bleeding by ${fmtNum(Math.abs(amt))}`)}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: [] };
    }
    markNegative();
    return { html: `${red(`Increases bleeding by ${fmtNum(amt)}`)}${minLabel(minU)}${condText(cond)}`, negativeMinCandidates: negativeMins };
  }

  // ---- MovementSpeedModifier ----
  if (t === "MovementSpeedModifier") {
    // Treat below 1 as reduction, above 1 as increase
    const w = Number(effect.walkSpeedModifier);
    const s = Number(effect.sprintSpeedModifier);

    const parts = [];
    const add = (label, v) => {
      if (!Number.isFinite(v) || v === 1) return;
      const pct = (v - 1) * 100; // 0.65 => -35
      const absPct = Math.abs(Math.round(pct * 10) / 10);

      if (pct < 0) {
        markNegative();
        parts.push(red(`Reduces ${label} speed by ${absPct}%`));
      } else {
        parts.push(green(`Increases ${label} speed by ${absPct}%`));
      }
    };

    add("walk", w);
    add("sprint", s);

    if (!parts.length) return null;

    return {
      html: `${parts.join(" + ")}${minLabel(minU)}${condText(cond)}`,
      negativeMinCandidates: negativeMins
    };
  }

  // ---- AdjustTemperature ----
  if (t === "AdjustTemperature") {
    const amt = Number(effect.amount);
    if (!Number.isFinite(amt) || amt === 0) return null;

    const sign = amt > 0 ? "+" : "";
    const line = `${(`Adjusts metabolizer temperature by ${sign}${fmtNum(amt)}J`)}${minLabel(minU)}${condText(cond)}`;
    return { html: line, negativeMinCandidates: [] };
  }

  // ---- CureZombieInfection ----
  if (t === "CureZombieInfection") {
    const inoc = effect.innoculate === true ? " (innoculates / full immunity)" : "";
    // always positive (apart for the zombies I guess but they can't do chemistry, I think...)
    const line = `${green(`Cures zombie infection${inoc}`)}${minLabel(minU)}${condText(cond)}`;
    return { html: line, negativeMinCandidates: [] };
  }
  // ---- Default / Unknown effect types ----
  // Unknown effects marked as negative-ish only if they have ReagentCondition min
  // (because they’re usually “side effect” style entries)
  if (minU != null) markNegative();
  const p = typeof effect.probability === "number" ? ` (p=${effect.probability})` : "";
  return {
    html: `${muted(t)}${p}${minLabel(minU)}${condText(cond)}`,
    negativeMinCandidates: negativeMins,
  };
}

// Format a single plant metabolism effect line for a reagent
function plantLine(p) {
  const t = p?.__type;
  if (!t) return null;

  const pct = fmtPercent(p.probability);
  const chance = pct ? ` with a ${pct} chance` : "";

  const amt = (typeof p.amount === "number" && Number.isFinite(p.amount)) ? p.amount : null;
  switch (t) {
    case "PlantAdjustWater":
      return `Waters the plant by ${fmtNum(amt)} per unit`;
    case "PlantAdjustNutrition":
      return `Adjusts nutrition by ${fmtNum(amt)} per unit`;
    case "PlantAdjustWeeds":
      return `Adjusts weeds by ${fmtNum(amt)}${chance}`;
    case "PlantAdjustPests":
      return `Adjusts pests by ${fmtNum(amt)}${chance}`;
    case "PlantAdjustHealth":
      return `${amt < 0 ? "Reduces" : "Increases"} plant health by ${fmtNum(amt)}`;
    case "PlantRestoreSeeds":
      return `Has a ${fmtPercent(p.probability) ?? "?"} chance of restoring seeds`;
    case "PlantAdjustPotency":
      return `${amt < 0 ? "Reduces" : "Increases"} plant potency by ${fmtNum(amt)}`;
    case "PlantAdjustMutationMod":
      return `Adjusts mutation modifier by ${fmtNum(amt)}${chance}`;
    case "PlantAdjustToxins":
      return `Adjusts toxins by ${fmtNum(amt)}`;
    case "PlantAffectGrowth":
      return `Has a ${fmtPercent(p.probability) ?? "?"} chance to adjust growth by ${fmtNum(amt)}`;
    default:
      return null; // keep unknown plant types hidden
  }
}

// For most reagents the default rate is 0.5 units per second
const DEFAULT_METABOLISM_RATE = 0.5;

// Build UI section for reagent effects and track negative thresholds
function buildEffectsUI(reagentId, reagent) {
  const wrapper = document.createElement("div");
  const negativeThresholds = new Set();

  const metabolisms = reagent?.metabolisms || {};
  for (const [metName, met] of Object.entries(metabolisms)) {
    const effects = met?.effects;
    if (!Array.isArray(effects) || effects.length === 0) continue;

    const rate =
      typeof met.metabolismRate === "number" && met.metabolismRate > 0
        ? met.metabolismRate
        : DEFAULT_METABOLISM_RATE;

    const section = document.createElement("div");
    section.style.marginTop = "10px";

    const head = document.createElement("div");
    head.className = "muted";
    head.innerHTML = `<b>Metabolism:</b> ${metName}${rate != null ? ` <span class="pill">rate: ${rate}u per second</span>` : ""}`;
    section.appendChild(head);

    const ul = document.createElement("ul");
    ul.style.margin = "8px 0 0 0";
    ul.style.paddingLeft = "18px";

    for (const eff of effects) {
      const formatted = formatEffectLine(eff, reagentId, rate);
      if (!formatted) continue;

      for (const m of formatted.negativeMinCandidates || []) negativeThresholds.add(m);

      const li = document.createElement("li");
      li.innerHTML = formatted.html;
      ul.appendChild(li);
    }

    if (ul.children.length) {
      section.appendChild(ul);
      wrapper.appendChild(section);
    }
  }

  // Plant metabolism display 
  const plant = reagent?.plantMetabolism;
  if (Array.isArray(plant) && plant.length) {
    const section = document.createElement("div");
    section.style.marginTop = "10px";

    const head = document.createElement("div");
    head.className = "muted";
    head.innerHTML = `<b>Plant effects:</b>`;
    section.appendChild(head);

    const ul = document.createElement("ul");
    ul.style.margin = "8px 0 0 0";
    ul.style.paddingLeft = "18px";

    for (const p of plant) {
      const line = plantLine(p);
      if (!line) continue;

      const li = document.createElement("li");
      // Plant effects can be good or bad, so keeps neutral color
      li.innerHTML = `<span class="muted">${line}</span>`;
      ul.appendChild(li);
    }

    if (ul.children.length) {
      section.appendChild(ul);
      wrapper.appendChild(section);
    }
  }


  // Threshold summary
  const minsSorted = [...negativeThresholds].filter(Number.isFinite).sort((a, b) => a - b);
  if (minsSorted.length) {
    const p = document.createElement("div");
    p.style.marginTop = "10px";
    p.className = "muted";

    if (minsSorted.length === 1) {
      p.innerHTML = `<b>Negative effects start at:</b> ${red(`${minsSorted[0]}u`)}`;
    } else {
      const first = minsSorted[0];
      const rest = minsSorted.slice(1);
      p.innerHTML =
        `<b>Negative effects start at:</b> ${red(`${first}u`)}` +
        ` <span class="muted">; increases at: ${rest.map(x => red(`${x}u`)).join(", ")}</span>`;
    }

    wrapper.prepend(p);
  }

  return wrapper;
}


// ---------- Main load ----------
// Load data and build initial indexes from JSON data
const merged = await loadMerged();
const { reactionById, reagentById, sourceById } = buildIndexes(merged);

// Expose data reload function for browser console debugging
window.__RR_LOAD_DATA__ = function (mergedByFilename, mode = "replace") {

  if (mode === "replace") {
    reactionById.clear();
    reagentById.clear();
    sourceById.clear();
  }

  for (const [filename, pack] of Object.entries(mergedByFilename || {})) {
    const byId = pack?.byId || {};
    for (const [id, entry] of Object.entries(byId)) {
      if (entry.reaction) {
        // ignore reactions with requiredMixerCategories or conserveEnergy
        const rx = entry.reaction;
        if (rx.requiredMixerCategories || rx.conserveEnergy !== undefined) continue;
        reactionById.set(id, rx);
        sourceById.set(id, filename);
      }
      if (entry.reagent) {
        reagentById.set(id, entry.reagent);
      }
    }
  }

  // Rebuild derived things
  maxScaleMemo.clear();
  rebuildSearchIndex?.();
  buildFilterOptions?.();
  const search = $("#search")?.value || "";
  const modeVal = $("#groupFilter")?.value || "__ALL__";
  renderList(search, modeVal);
};

// Rebuilds search index so that it's updated after data load
rebuildSearchIndex();

// Get reagent group or default to "Unknown", which is alot of reagents unfortunately >:(
function getGroupOf(id) {
  return reagentById.get(id)?.group ?? "Unknown";
}

// Rebuild filter dropdown options (groups and categories)
function buildFilterOptions() {
  const sel = document.querySelector("#groupFilter");
  const prev = sel.value || "__ALL__";

  // Ensure Favorites exists
  if (!catState.categories.includes("Favorites")) {
    catState.categories.unshift("Favorites");
    saveCatState(catState);
  }

  // Count recipes per group
  const groupCounts = new Map();
  for (const id of reactionById.keys()) {
    const g = getGroupOf(id);
    groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
  }
  const sortedGroups = [...groupCounts.keys()].sort((a, b) => a.localeCompare(b));

  // Count recipes per category
  const catCounts = new Map();
  for (const c of catState.categories) catCounts.set(c, 0);
  for (const [id, cats] of Object.entries(catState.membership || {})) {
    if (!reactionById.has(id)) continue;
    for (const c of cats) catCounts.set(c, (catCounts.get(c) || 0) + 1);
  }

  const sortedCats = [...new Set(catState.categories)]
    .filter(Boolean)
    .sort((a, b) => (a === "Favorites" ? -1 : b === "Favorites" ? 1 : a.localeCompare(b)));

  const groupOptions = sortedGroups
    .map(g => `<option value="group:${g}">${g} (${groupCounts.get(g) || 0})</option>`)
    .join("");

  const catOptions = sortedCats
    .map(c => `<option value="cat:${c}">★ ${c} (${catCounts.get(c) || 0})</option>`)
    .join("");

  sel.innerHTML = `
    <option value="__ALL__">All</option>
    <optgroup label="Groups">
      ${groupOptions}
    </optgroup>
    <optgroup label="My categories">
      ${catOptions}
    </optgroup>
  `;

  const stillExists = [...sel.options].some(o => o.value === prev);
  sel.value = stillExists ? prev : "__ALL__";
}

// Get current filter mode from dropdown
function currentFilterMode() {
  return $("#groupFilter").value || "__ALL__";
}

// Event listeners for search and filter buttons
$("#search").addEventListener("input", () => {
  renderList($("#search").value || "", currentFilterMode());
});

$("#groupFilter").addEventListener("change", () => {
  renderList($("#search").value || "", currentFilterMode());
});

// Render initial list view
renderList("", "__ALL__");

// Builds a production plan tree for a given reagent ID
function buildPlan(id, scale = null, neededUnits = null) {
  const r = reactionById.get(id);
  const chosenScale = scale ?? maxScaleFor(id);

  const primary = getPrimaryOutput(r);
  const producedPrimary = primary.coeff * chosenScale;

  // If parent tells us how many units it actually needs, compute “excess”
  const need = (neededUnits == null) ? producedPrimary : neededUnits;
  const excessPrimary = producedPrimary > need ? (producedPrimary - need) : 0n;

  const reactants = getReactantEntries(r);

  const reactantLines = reactants.map(rr => {
    const units = rr.catalyst ? 1n : ceilFracToInt(mulFracInt(rr.amountFrac, chosenScale));
    return {
      name: rr.name,
      units,
      parts: rr.parts,
      catalyst: rr.catalyst,
      craftable: reactionById.has(rr.name),
    };
  });

  const outputs = getAllOutputs(r, chosenScale);

  // catalysts are inputs marked catalyst=true (will always default to 1u cause that's all that's necessary)
  const catalysts = reactantLines
    .filter(x => x.catalyst)
    .map(x => ({ name: x.name, units: x.units }));

  // Byproduct waste = any outputs that are NOT the primary output
  // (Also avoids listing “catalyst return” as waste if output matches a catalyst reagent, cause it's not wasted, duh)
  const catalystNames = new Set(reactantLines.filter(x => x.catalyst).map(x => x.name));
  const byproductWaste = [];
  for (const o of outputs) {
    if (o.name === primary.name) continue;
    if (catalystNames.has(o.name)) continue;
    byproductWaste.push(o);
  }

  // children: build enough to satisfy the needed units of the reactant
  const children = [];
  for (const line of reactantLines) {
    if (!line.craftable) continue;

    const child = reactionById.get(line.name);
    const { coeff: childOutCoeff } = getPrimaryOutput(child);
    if (childOutCoeff === 0n) continue;

    // minimal child scale to cover this line’s required units, otherwise it'd do things like: 0u needed cause it's 0.05 or some crap but now minimum is 1u so it takes that into account
    const scaleChild = ceilFracToInt({ num: line.units, den: childOutCoeff });

    children.push(buildPlan(line.name, scaleChild, line.units));
  }

  const totalInput = reactantLines.reduce((acc, x) => acc + x.units, 0n);

  return {
    id,
    reaction: r,
    reagent: reagentById.get(id) || null,
    source: sourceById.get(id) || null,

    scale: chosenScale,

    primaryOut: primary,
    producedPrimary,
    neededPrimary: need,
    excessPrimary,
    byproductWaste,

    totalInput,
    outputs,
    catalysts,
    reactants: reactantLines,
    children,
  };
}

// Helper to accumulate waste totals in a Map
function addWaste(map, name, units) {
  if (!units || units <= 0n) return;
  map.set(name, (map.get(name) ?? 0n) + units);
}

// Calculate total waste from all production steps
function collectWasteFromSteps(steps) {
  // steps is array like [{node, depth}, ...]
  const waste = new Map();

  for (const { node } of steps) {
    // excess of primary output (intermediate overproduction)
    addWaste(waste, node.primaryOut?.name ?? node.id, node.excessPrimary ?? 0n);

    // byproducts
    if (Array.isArray(node.byproductWaste)) {
      for (const w of node.byproductWaste) addWaste(waste, w.name, w.units);
    }
  }

  // total
  let total = 0n;
  for (const u of waste.values()) total += u;

  return { waste, total };
}

// Flatten plan tree into dependency-first order (deepest children first)
function flattenDependencyFirst(node, depth = 0, out = []) {
  for (const child of node.children) flattenDependencyFirst(child, depth + 1, out);
  out.push({ node, depth });
  return out;
}

// ---------- Render ----------
// Render detailed recipe view for selected reagent
function renderRecipe(id) {
  const root = buildPlan(id);
  const steps = flattenDependencyFirst(root);
  const { waste, total } = collectWasteFromSteps(steps);



  const view = $("#view");
  view.innerHTML = "";
  $("#view").dataset.activeId = id;

  // Header card
  const card = document.createElement("div");
  card.className = "card";

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const h2 = document.createElement("h2");
  h2.innerHTML = coloredNameHTML(root.id, reagentById);

  const star = document.createElement("button");
  star.className = "icon-btn star";
  star.title = "Save to categories";
  star.innerHTML = isStarred(root.id) ? "★" : "☆";
  star.addEventListener("click", (e) => {
    e.stopPropagation();
    starClick(root.id);
  });

  titleRow.appendChild(h2);
  titleRow.appendChild(star);
  card.appendChild(titleRow);


  const reagent = root.reagent;
  const restrict = restrictionsHTML(reagent);
  const group = reagent?.group ?? "Unknown";
  const color = safeColor(reagent?.color);
  const src = root.source ?? "Unknown source";
  const temp = getMinTemp(root.reaction);

  const meta = document.createElement("div");
  meta.className = "muted";

  const swatch = color ? `${colorSwatchHTML(root.id, reagentById)}${color}` : `n/a`;
  const heatLine = temp != null ? `<span class="heat">Heat until fully mixed (${temp}K).</span><br/>` : "";

  const negMins = reagent ? getNegativeThresholdSummary(root.id, reagent) : null;
  const negLine = negMins
    ? `<div><b>Negative effects:</b> start at <span style="color:#ff5b5b;font-weight:700">${negMins[0]}u</span>${negMins.length > 1
      ? `; increase at ${negMins.slice(1).map(x => `<span style="color:#ff5b5b;font-weight:700">${x}u</span>`).join(", ")}`
      : ""
    }</div>`
    : "";

  let wasteLine = `<div class="muted">No waste.</div>`;
  if (total > 0n) {
    // show top 6 waste items, biggest first, vibe code OH YEAH
    const items = [...waste.entries()]
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, 6)
      .map(([name, units]) => `${formatUnits(units)} ${coloredNameHTML(name, reagentById)}`);

    const extraCount = waste.size - items.length;

    wasteLine = `
    <div><b>Total waste:</b> <span class="muted">${formatUnits(total)}</span></div>
    <div class="muted"><b>Waste breakdown:</b> ${items.join(" + ")}${extraCount > 0 ? ` + … (${extraCount} more)` : ""}</div>
  `;
  }

  meta.innerHTML = `
  <div><b>Id:</b> ${coloredNameHTML(root.id, reagentById)}</div>
  <div><b>Group:</b> ${group}</div>
  <div><b>Color:</b> ${swatch}</div>
  <div><b>Source:</b> ${src}</div>
  ${restrict ? `<div style="margin-top:8px;">${restrict}</div>` : ""}

  <div style="margin-top:10px;">
    ${negLine}
    ${heatLine}
    <div><b>Batch output:</b>
      <b>${root.outputs.map(o => `${formatUnits(o.units)} ${coloredNameHTML(o.name, reagentById)}`).join(" + ")}</b>
      ${root.catalysts.length
      ? ` + <span class="cat">${root.catalysts.map(c => `${formatUnits(c.units)} ${coloredNameHTML(c.name, reagentById)} (CAT)`).join(" + ")}</span>`
      : ""}
    </div>
    ${wasteLine}
  </div>
`;

  card.appendChild(meta);

  // Effects formatting
  if (reagent) {
    const details = document.createElement("details");
    details.style.marginTop = "10px";

    const summary = document.createElement("summary");
    summary.textContent = "Effects";
    summary.style.cursor = "pointer";
    summary.style.userSelect = "none";

    const box = document.createElement("div");
    box.style.marginTop = "10px";
    box.style.padding = "10px";
    box.style.border = "1px solid #242424";
    box.style.borderRadius = "12px";
    box.style.background = "#0f1117";

    box.appendChild(buildEffectsUI(root.id, reagent));

    details.appendChild(summary);
    details.appendChild(box);
    card.appendChild(details);
  }

  view.appendChild(card);

  // Steps card
  const stepsWrap = document.createElement("div");
  stepsWrap.className = "card";
  stepsWrap.innerHTML = `<div class="title">Build order (dependencies first)</div>`;

  const ol = document.createElement("ol");
  ol.className = "steps";

  steps.forEach(({ node, depth }, idx) => {
    const li = document.createElement("li");
    li.className = "step";

    const stepOut = getPrimaryOutput(node.reaction);

    const header = document.createElement("div");
    header.className = "title";

    // Show output name + its coefficient in parentheses
    // If reaction id differs from output name, shows the reaction id in muted brackets
    const reactionTag = (node.id !== stepOut.name)
      ? ` <span class="muted">[${node.id}]</span>`
      : "";

    header.innerHTML = `${idx + 1}. ${coloredNameHTML(stepOut.name, reagentById)} (${stepOut.coeff.toString()})${reactionTag}`;


    const outLine = document.createElement("div");
    outLine.className = "muted";

    const t = getMinTemp(node.reaction);
    const heat = t != null ? ` - <span class="heat">Heat until fully mixed (${t}K).</span>` : "";

    const outStr = node.outputs
      .map(o => `${formatUnits(o.units)} ${coloredNameHTML(o.name, reagentById)}`)
      .join(" + ");

    const catStr = node.catalysts.length
      ? ` + ${node.catalysts.map(c => `${formatUnits(c.units)} ${coloredNameHTML(c.name, reagentById)} (CAT)`).join(" + ")}`
      : "";

    outLine.innerHTML = `
      Input: <b>${formatUnits(node.totalInput)}</b> - Output: <b>${outStr}</b>
      ${node.catalysts.length ? ` + <span class="cat">${catStr.replace(/^ \+ /, "")}</span>` : ""}
      ${heat}
    `;

    const indent = document.createElement("div");
    indent.className = "indent";
    indent.style.marginLeft = `${depth * 10}px`;

    const ul = document.createElement("ul");
    ul.className = "reactants";

    node.reactants.forEach(r => {
      const item = document.createElement("li");
      const partsTxt = (r.parts != null) ? ` (${r.parts})` : "";
      const cat = r.catalyst ? ` <span class="cat">CAT (1u)</span>` : "";
      const made = r.craftable ? ` <span class="muted">(made earlier)</span>` : "";

      item.innerHTML = `<b>${formatUnits(r.units)}</b> ${coloredNameHTML(r.name, reagentById)}${partsTxt}${cat}${made}`;
      ul.appendChild(item);
    });

    indent.appendChild(ul);

    li.appendChild(header);
    li.appendChild(outLine);
    li.appendChild(indent);
    ol.appendChild(li);

    const extras = [];

    if (node.excessPrimary > 0n) {
      extras.push(
        `<div>Remove <b>${formatUnits(node.excessPrimary)}</b> excess ${coloredNameHTML(node.primaryOut.name, reagentById)}.</div>`
      );
    }

    if (node.byproductWaste?.length) {
      const byp = node.byproductWaste
        .map(w => `<b>${formatUnits(w.units)}</b> ${coloredNameHTML(w.name, reagentById)}`)
        .join(" + ");
      extras.push(`<div class="muted">Byproducts (remove): ${byp}.</div>`);
    }

    if (extras.length) {
      const extraDiv = document.createElement("div");
      extraDiv.style.marginTop = "6px";
      extraDiv.innerHTML = extras.join("");
      li.appendChild(extraDiv);
    }
  });
  stepsWrap.appendChild(ol);
  view.appendChild(stepsWrap);
}

// ---------- Modal UI ----------
// Create modal for category management if it doesn't exist
function ensureModal() {
  if (document.querySelector("#catModalOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "catModalOverlay";
  overlay.className = "modal-overlay hidden";

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Save to categories</div>
        <button class="icon-btn" id="catModalClose" aria-label="Close">✕</button>
      </div>

      <div class="modal-body">
        <div class="muted" id="catModalItem"></div>

        <div class="modal-section">
          <div class="modal-section-title">Categories</div>
          <p class="muted">Select which category to save to, or remove the item by unticking the box:</p>
          <div id="catModalChecks" class="checks"></div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">Create category</div>
          <div class="modal-row">
            <input id="catNewName" type="text" placeholder="e.g. Brute meds" />
            <button class="btn" id="catAddBtn">Add</button>
          </div>
          <div class="muted">Favorites category always exists and can't be deleted.</div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">Delete category</div>
          <p class="muted">Pressing delete will instantly remove the selected category:</p>
          <div class="modal-row">
            <select id="catDeleteSelect"></select>
            <button class="btn danger" id="catDeleteBtn">Delete</button>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn" id="catDoneBtn">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.classList.add("hidden");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("#catModalClose").addEventListener("click", close);
  overlay.querySelector("#catDoneBtn").addEventListener("click", close);

  // ESC closes
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
  });
}
wireCapButtons();

let modalActiveId = null;

// Open category management modal for specific reagent
function openCategoryModal(id) {
  ensureModal();
  modalActiveId = id;

  const current = new Set(getCatsFor(id));

  // Refresh UI (without changing filter selection)
  const search = $("#search")?.value || "";
  const mode = $("#groupFilter")?.value || "__ALL__";
  renderList(search, mode);
  if ($("#view")?.dataset?.activeId === id) renderRecipe(id);

  const overlay = document.querySelector("#catModalOverlay");
  overlay.classList.remove("hidden");

  // UI bits
  overlay.querySelector("#catModalItem").innerHTML =
    `Selected: <b>${coloredNameHTML(id, reagentById)}</b>`;

  const checks = overlay.querySelector("#catModalChecks");
  checks.innerHTML = "";

  // Ensure Favorites exists
  if (!catState.categories.includes("Favorites")) {
    catState.categories.unshift("Favorites");
    saveCatState(catState);
  }

  // Build checkboxes
  for (const c of catState.categories) {
    const row = document.createElement("label");
    row.className = "check";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = current.has(c);

    cb.addEventListener("change", () => {
      const next = new Set(getCatsFor(id));
      if (cb.checked) next.add(c);
      else next.delete(c);
      setCatsFor(id, [...next]);
      // refresh stars in list + view
      buildFilterOptions();
      renderList($("#search").value || "", $("#groupFilter").value || "__ALL__");
      if ($("#view")?.dataset?.activeId === id) renderRecipe(id);
    });

    const name = document.createElement("span");
    name.textContent = c;

    row.appendChild(cb);
    row.appendChild(name);
    checks.appendChild(row);
  }

  // Create category
  overlay.querySelector("#catNewName").value = "";
  overlay.querySelector("#catAddBtn").onclick = () => {
    const name = overlay.querySelector("#catNewName").value.trim();
    const created = ensureCategory(name);
    if (!created) return;

    // auto-check new category for this reagent
    const next = new Set(getCatsFor(id));
    next.add(created);
    setCatsFor(id, [...next]);

    // Re-open to refresh checkbox list
    openCategoryModal(id);
    renderList($("#search")?.value || "", $("#groupFilter")?.value || "__ALL__");
    if ($("#view")?.dataset?.activeId === id) renderRecipe(id);
  };

  // Delete category dropdown (exclude Favorites)
  const delSel = overlay.querySelector("#catDeleteSelect");
  const deletables = catState.categories.filter(c => c !== "Favorites");
  delSel.innerHTML = deletables.length
    ? deletables.map(c => `<option value="${c}">${c}</option>`).join("")
    : `<option value="">(none)</option>`;

  overlay.querySelector("#catDeleteBtn").onclick = () => {
    const val = delSel.value;
    if (!val) return;
    deleteCategory(val);
    // Re-open to refresh
    openCategoryModal(id);
    renderList($("#search")?.value || "", $("#groupFilter")?.value || "__ALL__");
    if ($("#view")?.dataset?.activeId === id) renderRecipe(id);
  };
}

// Handle star click (add to Favorites and open modal)
function starClick(id) {
  // default behavior: add Favorites (but star icon will still mean "in any category")
  const current = new Set(getCatsFor(id));
  current.add("Favorites");
  setCatsFor(id, [...current]);

  // refresh UI immediately
  const search = $("#search")?.value || "";
  const mode = $("#groupFilter")?.value || "__ALL__";
  renderList(search, mode);
  if ($("#view")?.dataset?.activeId === id) renderRecipe(id);

  openCategoryModal(id);
}

// Render filtered list of recipes based on search and filter criteria
function renderList(search = "", filterMode = "__ALL__") {
  const list = $("#list");
  list.innerHTML = "";

  const q = search.toLowerCase();

  let ids = [...reactionById.keys()]
    .filter(id => {
      if (!q) return true;
      const doc = searchIndex.get(id) || id.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      return terms.every(t => doc.includes(t));
    })
    .sort((a, b) => a.localeCompare(b));

  if (filterMode && filterMode !== "__ALL__") {
    if (filterMode.startsWith("group:")) {
      const g = filterMode.slice("group:".length);
      ids = ids.filter(id => getGroupOf(id) === g);
    } else if (filterMode.startsWith("cat:")) {
      const c = filterMode.slice("cat:".length);
      ids = ids.filter(id => isInCat(id, c));
    }
  }

  $("#countLine").textContent = `${ids.length} recipes shown`;

  if (ids.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No matches.";
    list.appendChild(empty);
    return;
  }

  ids.forEach(id => {
    const starred = isStarred(id);
    const starGlyph = starred ? "★" : "☆";

    const scale = maxScaleFor(id);
    const r = reactionById.get(id);
    const primary = getPrimaryOutput(r);
    const units = primary.coeff * scale;

    const restriction = restrictionsHTML(reagentById.get(id));
    const restrictionBadge = restriction ? `<span>${restriction}</span>` : "";

    const reagent = reagentById.get(id);
    const group = reagent?.group ?? "Unknown";

    const btn = document.createElement("button");
    btn.className = "item";
    btn.dataset.id = id;

    // Color swatch + colored text
    btn.innerHTML = `
  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
    <div><b>${colorSwatchHTML(id, reagentById)}${coloredNameHTML(id, reagentById)}</b></div>
    <button class="icon-btn star" data-star="1" title="Save to categories">${starGlyph}</button>
  </div>
  <div class="muted">${restrictionBadge}</div>
  <div class="muted">${group}</div>
  <div class="muted">batch: ${formatUnits(units)} ${coloredNameHTML(primary.name, reagentById)}</div>
`;

    btn.querySelector('[data-star="1"]').addEventListener("click", (e) => {
      e.stopPropagation();
      starClick(id);
    });

    btn.addEventListener("click", () => {
      [...list.querySelectorAll(".item")].forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      renderRecipe(id);
    });

    list.appendChild(btn);
  });

  const first = list.querySelector(".item");
  if (first) first.click();
}

$("#search").addEventListener("input", (e) => {
  renderList(e.target.value || "");
});

// Find negative thresholds for this reagent (from formatted effects)
function getNegativeThresholdSummary(reagentId, reagent) {
  const thresholds = new Set();
  const metabolisms = reagent?.metabolisms || {};
  for (const met of Object.values(metabolisms)) {
    const rate = typeof met?.metabolismRate === "number" ? met.metabolismRate : null;
    const effects = met?.effects;
    if (!Array.isArray(effects)) continue;
    for (const eff of effects) {
      const formatted = formatEffectLine(eff, reagentId, rate);
      if (!formatted) continue;
      for (const m of formatted.negativeMinCandidates || []) thresholds.add(m);
    }
  }
  const minsSorted = [...thresholds].filter(Number.isFinite).sort((a, b) => a - b);
  if (!minsSorted.length) return null;
  return minsSorted;
}

$("#search").addEventListener("input", () => {
  renderList($("#search").value || "", $("#groupFilter").value || "__ALL__");
});

$("#groupFilter").addEventListener("change", () => {
  renderList($("#search").value || "", $("#groupFilter").value || "__ALL__");
});

// Initial render calls
renderList("", "__ALL__");
buildFilterOptions();
renderList("");
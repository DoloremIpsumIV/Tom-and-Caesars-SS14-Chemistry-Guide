/*So this is just the fetch that then gets merged into an empty JSON file which then the calculator grabs and formats data from. 
Will probably change this at some point so you can either choose other forks and branches and stuff like goob, funky, yada yada. 
I tried implementing this at first (hence random functions and variables that do nothing) but due to the different formatting of YML files in different branches it got messy fast so i opted for a GAURANTEED working version first.
Best would be if you could just enter your own branch and then it'd just WORK PERFECTLY AND AUTOMATICALLY but due to the different (incorrect mind you) YML formatting I will prob need to manually add all of them...
*/

// Uses GitHub Contents API + js-yaml to fetch YAML, merge, then hand result to calculator.js, as always this is running on vibes, thoughts, prayers, and copius amounts of redbull :p
import jsyaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs";

// ---------- Repo profiles ----------
const REPO_KEY = "rr_repo_profiles_v1"; // LocalStorage key for repo profiles
const REPO_SEL_KEY = "rr_repo_profiles_selected_v1"; // LocalStorage key for selected profile, currently not usefull as only wizden is used for now

// Default SS14 repository profile (locked, cannot be deleted cause it works and if more profiles are added it should be default)
const DEFAULT_PROFILE = {
    name: "Wizden",
    owner: "space-wizards",
    repo: "space-station-14",
    ref: "master",
    locked: true, // cannot be deleted
};

// Utility function to pause execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Load repository profiles from localStorage
function loadRepoProfiles() {
    try {
        const raw = localStorage.getItem(REPO_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const arr = Array.isArray(parsed) ? parsed : [];
        const cleaned = arr
            .filter(p => p && typeof p === "object")
            .map(p => ({
                name: String(p.name || "").trim(),
                owner: String(p.owner || "").trim(),
                repo: String(p.repo || "").trim(),
                ref: String(p.ref || "").trim(),
                locked: !!p.locked,
            }))
            .filter(p => p.name && p.owner && p.repo && p.ref);

        // Ensure default exists
        const hasDefault = cleaned.some(p => p.name === DEFAULT_PROFILE.name);
        if (!hasDefault) cleaned.unshift(DEFAULT_PROFILE);

        // Deduplicate by name
        const byName = new Map();
        for (const p of cleaned) if (!byName.has(p.name)) byName.set(p.name, p);
        return [...byName.values()];
    } catch {
        return [DEFAULT_PROFILE];
    }
}

// Save repository profiles to localStorage
function saveRepoProfiles(list) {
    localStorage.setItem(REPO_KEY, JSON.stringify(list));
}

let repoProfiles = loadRepoProfiles();

// Get the currently selected repository name from localStorage
function getSelectedRepoName() {
    return localStorage.getItem(REPO_SEL_KEY) || DEFAULT_PROFILE.name;
}

// Set the currently selected repository name in localStorage
function setSelectedRepoName(name) {
    localStorage.setItem(REPO_SEL_KEY, name);
}

// Get the active profile object based on selected name
function getActiveProfile() {
    const name = getSelectedRepoName();
    return repoProfiles.find(p => p.name === name) || DEFAULT_PROFILE;
}

// Rebuild the repository selection dropdown in the UI
function rebuildRepoSelect() {
    const sel = document.getElementById("repoSelect");
    const prev = sel.value || getSelectedRepoName();

    sel.innerHTML = repoProfiles
        .map(p => `<option value="${p.name}">${p.name} — ${p.owner}/${p.repo}@${p.ref}</option>`)
        .join("");

    const still = repoProfiles.some(p => p.name === prev);
    sel.value = still ? prev : DEFAULT_PROFILE.name;
    setSelectedRepoName(sel.value);
}

// SS14 directory paths for reactions and reagents prototypes
const REACTIONS_DIR = "Resources/Prototypes/Recipes/Reactions";
const REAGENTS_DIR = "Resources/Prototypes/Reagents";

// Default YAML files to load from SS14 repositories, this could be changed or be different depending on branch, for now it works but might need changing in an update yada yada
const DEFAULT_FILES = [
    "biological.yml",
    "botany.yml",
    "chemicals.yml",
    "cleaning.yml",
    "fun.yml",
    "elements.yml",
    "gases.yml",
    "medicine.yml",
    "narcotics.yml",
    "pyrotechnic.yml",
    "toxins.yml",
];

const CACHE_KEY = "rr_merged_cache_v1"; // LocalStorage key for cached data

// DOM helper functions
const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

// Append a line to the loader log display
function logLine(msg) {
    const box = el("loaderLog");
    if (!box) return;
    box.textContent += msg + "\n";
    box.scrollTop = box.scrollHeight;
}

// Show/hide the loader overlay, again, not a thing currently but might be readded later
function setOpen(open) {
    const overlay = el("loaderOverlay");
    if (!overlay) return;
    overlay.classList.toggle("hidden", !open);
}

// Update the fetch status indicator in the UI
function setFetchStatus(state, detail = "") {
    const pill = el("fetchStatus");
    const line = el("fetchStatusDetail");
    if (!pill && !line) return;

    if (pill) {
        pill.classList.remove("loading", "ok", "error");
        if (state === "loading") pill.classList.add("loading");
        if (state === "ok") pill.classList.add("ok");
        if (state === "error") pill.classList.add("error");

        pill.textContent =
            state === "loading" ? "Loading…" :
                state === "ok" ? "Loaded" :
                    state === "error" ? "Error" :
                        "Not loaded";
    }

    if (line) line.textContent = detail || "";
}

// List directory contents from GitHub API
async function listDir(profile, path) {
    const safePath = path.split("/").map(encodeURIComponent).join("/");
    const url =
        `https://api.github.com/repos/${encodeURIComponent(profile.owner)}/${encodeURIComponent(profile.repo)}` +
        `/contents/${safePath}?ref=${encodeURIComponent(profile.ref)}`;

    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`Failed listing ${path} from ${profile.owner}/${profile.repo}@${profile.ref}: HTTP ${res.status}`);
    return await res.json();
}

// Fetch raw text content from a URL
async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${url} (HTTP ${res.status})`);
    return await res.text();
}

// Convert SS14-specific !type:TypeName YAML syntax to standard YAML with __type (would be SO EASY if formatted properly from the start... AUGHHHHH)
function preprocessSs14Yaml(ymlText) {
    let t = ymlText;

    t = t.replace(
        /^(\s*-\s*)!type:([A-Za-z0-9_.]+)\s*\{\s*([^}]*)\s*\}\s*(#.*)?$/gm,
        (_, prefix, typeName, inner, comment) => {
            const trimmed = (inner ?? "").trim();
            const c = comment ? ` ${comment}` : "";
            if (!trimmed) return `${prefix}__type: ${typeName}${c}`;
            return `${prefix}{ __type: ${typeName}, ${trimmed} }${c}`;
        }
    );

    t = t.replace(
        /^(\s*-\s*)!type:([A-Za-z0-9_.]+)\s*(#.*)?$/gm,
        (_, prefix, typeName, comment) => `${prefix}__type: ${typeName}${comment ? ` ${comment}` : ""}`
    );

    t = t.replace(
        /^(\s*[^#:\n]+:\s*)!type:([A-Za-z0-9_.]+)\s*\{\s*([^}]*)\s*\}\s*(#.*)?$/gm,
        (_, keyPrefix, typeName, inner, comment) => {
            const trimmed = (inner ?? "").trim();
            const c = comment ? ` ${comment}` : "";
            if (!trimmed) return `${keyPrefix}{ __type: ${typeName} }${c}`;
            return `${keyPrefix}{ __type: ${typeName}, ${trimmed} }${c}`;
        }
    );

    t = t.replace(
        /^(\s*[^#:\n]+:\s*)!type:([A-Za-z0-9_.]+)\s*(#.*)?$/gm,
        (_, keyPrefix, typeName, comment) => `${keyPrefix}{ __type: ${typeName} }${comment ? ` ${comment}` : ""}`
    );

    return t;
}

// Parse YAML prototypes and return an array of objects with id and type
function parseYamlPrototypes(ymlText, sourceLabel) {
    const pre = preprocessSs14Yaml(ymlText);
    const docs = [];
    try {
        jsyaml.loadAll(pre, (doc) => { if (doc != null) docs.push(doc); });
    } catch (e) {
        throw new Error(`YAML parse error in ${sourceLabel}: ${e.message}`);
    }

    const items = [];
    for (const d of docs) Array.isArray(d) ? items.push(...d) : items.push(d);

    return items.filter(x => x && typeof x === "object" && x.id && x.type);
}

// Insert or update a prototype in a container by ID
function upsertById(container, proto, sourceKind) {
    const id = proto.id;
    if (!container[id]) container[id] = { id };
    container[id][sourceKind] = proto;
}

// Build the file selection checklist UI
function buildFileChecklist(files = DEFAULT_FILES) {
    const wrap = el("fileChecks");
    wrap.innerHTML = "";
    for (const f of files) {
        const row = document.createElement("label");
        row.className = "checkRow";
        row.innerHTML = `<input type="checkbox" data-file="${f}" checked> ${f}`;
        wrap.appendChild(row);
    }
}

// Get list of selected files from the checklist
function getSelectedFiles() {
    return [...el("fileChecks").querySelectorAll("input[type=checkbox]")]
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.file);
}

// Pass merged data to the main application via global hook
function applyMergedDataToApp(fetchedMerged, modeReplace) {
    if (typeof window.__RR_LOAD_DATA__ !== "function") {
        throw new Error("App loader hook not found. Add window.__RR_LOAD_DATA__ in calculator.js.");
    }
    window.__RR_LOAD_DATA__(fetchedMerged, modeReplace ? "replace" : "merge");
}

// Main function to fetch and merge data from GitHub repository
async function runFetchAndMerge(profile, files, skipMissing, delayMs) {
    const box = el("loaderLog");
    if (box) box.textContent = "";
    logLine(`Using repo: ${profile.name} — ${profile.owner}/${profile.repo}@${profile.ref}`);
    logLine("Listing directories…");

    const [reactionsEntries, reagentsEntries] = await Promise.all([
        listDir(profile, REACTIONS_DIR),
        listDir(profile, REAGENTS_DIR),
    ]);

    const reactionsFiles = new Map();
    for (const e of reactionsEntries) if (e.type === "file" && e.name.endsWith(".yml") && e.download_url) reactionsFiles.set(e.name, e.download_url);

    const reagentsFiles = new Map();
    for (const e of reagentsEntries) if (e.type === "file" && e.name.endsWith(".yml") && e.download_url) reagentsFiles.set(e.name, e.download_url);

    const mergedByFilename = {};
    for (const filename of files) mergedByFilename[filename] = { byId: {} };

    // Due to (SOME REASON) reactions and reagents being in separate files, we need to fetch both for each filename, even though MOST CONTAIN THE SAME REAGENTS WITH SAME ID, NAME, ETC, WHY NOT MERGE INTO ONE BY DEFAULT????
    for (const filename of files) {
        logLine(`\n== ${filename} ==`);

        // Reactions
        if (reactionsFiles.has(filename)) {
            const url = reactionsFiles.get(filename);
            logLine(`Reactions: ${url}`);
            const yml = await fetchText(url);
            if (delayMs > 0) await sleep(delayMs);
            const protos = parseYamlPrototypes(yml, `Reactions/${filename}`);
            logLine(`Reactions: parsed ${protos.length}`);
            for (const p of protos) upsertById(mergedByFilename[filename].byId, p, "reaction");
        } else {
            if (!skipMissing) throw new Error(`${filename} missing in reactions dir`);
            logLine("Reactions: (file not found) — skipped");
        }

        // Reagents
        if (reagentsFiles.has(filename)) {
            const url = reagentsFiles.get(filename);
            logLine(`Reagents: ${url}`);
            const yml = await fetchText(url);
            if (delayMs > 0) await sleep(delayMs);
            const protos = parseYamlPrototypes(yml, `Reagents/${filename}`);
            logLine(`Reagents: parsed ${protos.length}`);
            for (const p of protos) upsertById(mergedByFilename[filename].byId, p, "reagent");
        } else {
            if (!skipMissing) throw new Error(`${filename} missing in reagents dir`);
            logLine("Reagents: (file not found) — skipped");
        }
    }

    return mergedByFilename;
}

// Initialize all UI components and event listeners
function init() {
    const fetchBtn = el("fetchDataBtn");
    document.body.classList.add("rr-loading");
    if (fetchBtn) {
        setFetchStatus("idle", "");
        fetchBtn.addEventListener("click", async () => {
            fetchBtn.disabled = true;
            try {
                const profile = getActiveProfile();
                setFetchStatus("loading", `${profile.owner}/${profile.repo}@${profile.ref}`);
                logLine(`Starting fetch (${DEFAULT_FILES.length} files) from ${profile.owner}/${profile.repo}@${profile.ref}…`);

                const merged = await runFetchAndMerge(profile, DEFAULT_FILES, true, 80);

                applyMergedDataToApp(merged, true);

                const fileCount = Object.keys(merged || {}).length;
                setFetchStatus("ok", `Loaded ${fileCount} file set${fileCount === 1 ? "" : "s"}.`);

                const fetchBar = document.querySelector(".fetchbar");
                if (fetchBar) {
                    fetchBar.style.display = "none";
                }
                const info = el("info");
                if (info) info.style.display = "none";
                logLine("Loaded into app.");
            } catch (err) {
                console.error(err);
                setFetchStatus("error", err?.message || String(err));
                logLine("ERROR: " + (err?.message || String(err)));
            } finally {
                document.body.classList.remove("rr-loading");
                fetchBtn.disabled = false;
            }
        });
    }

    // --- Optional legacy modal UI (only if those elements exist, which they kinda don't right now) ---
    const openBtn = el("openLoader");
    const closeBtn = el("closeLoader");
    const runBtn = el("runLoader");
    const clearBtn = el("clearCache");

    if (!openBtn) return; // page doesn't have so skips

    buildFileChecklist(DEFAULT_FILES);

    openBtn.addEventListener("click", () => setOpen(true));
    if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));
    const overlay = el("loaderOverlay");
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) setOpen(false);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            localStorage.removeItem(CACHE_KEY);
            logLine("Cleared cached merged data.");
        });
    }

    rebuildRepoSelect();

    // When user changes repo dropdown
    const repoSelect = el("repoSelect");
    if (repoSelect) {
        repoSelect.addEventListener("change", () => {
            setSelectedRepoName(repoSelect.value);
        });
    }

    // Add new repo
    const repoAdd = el("repoAdd");
    if (repoAdd) {
        repoAdd.addEventListener("click", () => {
            const name = el("repoName").value.trim();
            const owner = el("repoOwner").value.trim();
            const repo = el("repoRepo").value.trim();
            const ref = el("repoRef").value.trim();

            if (!name || !owner || !repo || !ref) {
                logLine("ERROR: Please fill name, owner, repo, and ref.");
                return;
            }
            if (repoProfiles.some(p => p.name === name)) {
                logLine("ERROR: A repo profile with that name already exists.");
                return;
            }

            repoProfiles.push({ name, owner, repo, ref, locked: false });
            saveRepoProfiles(repoProfiles);
            rebuildRepoSelect();
            repoSelect.value = name;
            setSelectedRepoName(name);

            el("repoName").value = "";
            el("repoOwner").value = "";
            el("repoRepo").value = "";
            el("repoRef").value = "";

            logLine(`Added repo profile: ${name}`);
        });
    }

    // Delete selected repo (except Wizden)
    const repoDelete = el("repoDelete");
    if (repoDelete) {
        repoDelete.addEventListener("click", () => {
            const name = repoSelect.value;
            const prof = repoProfiles.find(p => p.name === name);
            if (!prof) return;
            if (prof.locked) {
                logLine("Cannot delete Wizden.");
                return;
            }
            repoProfiles = repoProfiles.filter(p => p.name !== name);
            saveRepoProfiles(repoProfiles);
            setSelectedRepoName(DEFAULT_PROFILE.name);
            rebuildRepoSelect();
            logLine(`Deleted repo profile: ${name}`);
        });
    }

    if (runBtn) {
        runBtn.addEventListener("click", async () => {
            try {
                const files = getSelectedFiles();
                const modeReplace = el("optReplace")?.checked ?? true;
                const cache = el("optCache")?.checked ?? false;
                const skipMissing = el("optSkipMissing")?.checked ?? true;
                const delayMs = Math.max(0, parseInt(el("fetchDelay")?.value || "0", 10) || 0);

                const profile = getActiveProfile();

                logLine(`Starting fetch (${files.length} files)…`);
                const merged = await runFetchAndMerge(profile, files, skipMissing, delayMs);

                if (cache) {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ profile, merged }));
                    logLine("Saved merged data to localStorage.");
                }

                applyMergedDataToApp(merged, modeReplace);
                logLine("Loaded into app.");
            } catch (err) {
                console.error(err);
                logLine("ERROR: " + (err?.message || String(err)));
            }
        });
    }
}
// Should I just comment out all the code in this file that isn't used currently? Yeah probably, will I do that though? No, not right now
init();
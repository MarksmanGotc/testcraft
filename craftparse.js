let initialMaterials = {};
const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.has('debug') && urlParams.get('debug') === 'true';

const LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45];
const normalizeKey = (str = '') =>
    (str || '')
        .toString()
        .toLowerCase()
        .replace(/["'`]/g, '')
        .replace(/\s+/g, '-');
const allMaterials = Object.values(materials).reduce((acc, season) => {
    return { ...acc, ...season.mats };
}, {});
const materialKeyMap = {};
const materialToSeason = {};
Object.values(materials).forEach(season => {
    Object.keys(season.mats).forEach(mat => {
        const normalized = normalizeKey(mat);
        materialKeyMap[normalized] = mat;
        materialToSeason[mat] = season.season;
        materialToSeason[normalized] = season.season;
    });
});
const normalizedKeyCache = new WeakMap();

const CALCULATION_STORAGE_KEY = 'noox-calculation-v1';
const CALCULATION_STORAGE_VERSION = 1;
let latestCalculationPayload = null;
let isViewingSavedCalculation = false;

function getNormalizedKeyMap(source) {
    if (!source || typeof source !== 'object') {
        return {};
    }
    let cached = normalizedKeyCache.get(source);
    if (!cached) {
        cached = {};
        Object.keys(source).forEach(key => {
            cached[normalizeKey(key)] = key;
        });
        normalizedKeyCache.set(source, cached);
    }
    return cached;
}
let qualityMultipliers = {};
const MATERIAL_RANK_POINTS = Object.freeze({
    1: 15,
    2: 11,
    3: 8,
    4: 5,
    5: 1,
    9: -7,
    10: -15,
    11: -30,
    12: -40
});
const MAX_DEFINED_MATERIAL_RANK = Math.max(
    ...Object.keys(MATERIAL_RANK_POINTS)
        .map(Number)
        .filter(rank => Number.isFinite(rank))
);
const MATERIAL_NEUTRAL_RANKS = new Set([6, 7, 8]);
const INSUFFICIENT_MATERIAL_PENALTY = -1000;
const CTW_LOW_LEVELS = new Set([1, 5, 10, 15]);
const GEAR_MATERIAL_SCORE = 15;
const SEASON_ZERO_LOW_BONUS = -5;
const SEASON_ZERO_HIGH_BONUS = 10;
const DEFAULT_RANK_PENALTY = -30;
const CTW_SET_NAME_FALLBACK = 'Ceremonial Targaryen Warlord';
const ctwSetName =
    typeof window !== 'undefined' && window.CTW_SET_NAME
        ? window.CTW_SET_NAME
        : CTW_SET_NAME_FALLBACK;

const SeasonZeroPreference = Object.freeze({
    OFF: 0,
    LOW: 1,
    NORMAL: 2,
    HIGH: 3
});
const seasonZeroValueText = {
    [SeasonZeroPreference.OFF]: 'Off - exclude Season 0 items',
    [SeasonZeroPreference.LOW]: 'Low weighting',
    [SeasonZeroPreference.NORMAL]: 'Normal weighting',
    [SeasonZeroPreference.HIGH]: 'High weighting'
};
let currentSeasonZeroPreference = SeasonZeroPreference.NORMAL;
const qualityColorMap = {
    poor: '#A9A9A9',
    common: '#32CD32',
    fine: '#0070DD',
    exquisite: '#A335EE',
    epic: '#FF8000',
    legendary: '#E5CC80'
};
let qualitySelectHandlersAttached = false;
let failedLevels = [];
let pendingFailedLevels = null;
let requestedTemplates = {};
let preserveRequestedTemplates = false;
let remainingUse = {};
let ctwMediumNotice = false;
let level20OnlyWarlordsActive = false;
const productsByLevel = craftItem.products.reduce((acc, product) => {
    const levelKey = product.level.toString();
    if (!acc[levelKey]) {
        acc[levelKey] = [];
    }
    acc[levelKey].push(product);
    return acc;
}, {});
const productLookup = new Map();
craftItem.products.forEach(product => {
    productLookup.set(getProductLookupKey(product), product);
});

function slug(str) {
    return (str || '')
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/['"`]/g, '')
        .replace(/[^a-z0-9-]/g, '');
}

function formatTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
        date.getFullYear().toString() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes())
    );
}

function waitForNextFrame() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });
}

function isLocalStorageAvailable() {
    try {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
            return false;
        }
        const testKey = '__noox_update_log__';
        window.localStorage.setItem(testKey, testKey);
        window.localStorage.removeItem(testKey);
        return true;
    } catch (error) {
        return false;
    }
}

function initializeUpdateLog() {
    const overlay = document.getElementById('updateLogOverlay');
    const trigger = document.getElementById('openUpdateLog');

    if (!overlay || !trigger) {
        return;
    }

    const closeButton = overlay.querySelector('.close-popup');
    const storageKey = 'noox-update-log-2025-06-10';
    const storageSupported = isLocalStorageAvailable();
    const hasSeenUpdate = storageSupported ? window.localStorage.getItem(storageKey) === 'seen' : false;

    const setUpdateIndicator = (hasUpdate) => {
        if (hasUpdate) {
            trigger.setAttribute('data-has-update', 'true');
        } else {
            trigger.removeAttribute('data-has-update');
        }
    };

    const markSeen = () => {
        if (storageSupported) {
            try {
                window.localStorage.setItem(storageKey, 'seen');
            } catch (error) {
                // Ignore storage failures silently
            }
        }
        setUpdateIndicator(false);
    };

    const setExpandedState = (expanded) => {
        trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };

    const openOverlay = () => {
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        setExpandedState(true);
        setUpdateIndicator(false);
    };

    const closeOverlay = (shouldMarkSeen = false) => {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        setExpandedState(false);
        if (shouldMarkSeen) {
            markSeen();
        }
    };

    setUpdateIndicator(!hasSeenUpdate);

    const setPanelState = (button, expanded) => {
        const panelId = button.getAttribute('aria-controls');
        const panel = panelId ? overlay.querySelector(`#${panelId}`) : null;
        if (!panel) {
            return;
        }

        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        panel.classList.toggle('open', expanded);
    };

    const closeAllPanels = () => {
        const toggles = overlay.querySelectorAll('.changelog-toggle');
        toggles.forEach(toggle => setPanelState(toggle, false));
    };

    const initializeAccordion = () => {
        const toggles = overlay.querySelectorAll('.changelog-toggle');
        toggles.forEach(toggle => {
            const initiallyExpanded = toggle.getAttribute('aria-expanded') === 'true';
            setPanelState(toggle, initiallyExpanded);

            toggle.addEventListener('click', () => {
                const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
                closeAllPanels();
                setPanelState(toggle, !isExpanded);
            });
        });
    };

    initializeAccordion();

    trigger.addEventListener('click', () => {
        if (overlay.style.display === 'flex') {
            closeOverlay(true);
        } else {
            openOverlay();
        }
    });

    closeButton?.addEventListener('click', () => closeOverlay(true));

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeOverlay(true);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.style.display === 'flex') {
            closeOverlay(true);
        }
    });
}

function loadSavedCalculation() {
    if (!isLocalStorageAvailable()) {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(CALCULATION_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        if (parsed.version && parsed.version !== CALCULATION_STORAGE_VERSION) {
            window.localStorage.removeItem(CALCULATION_STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch (error) {
        console.error('Failed to load saved calculation from storage', error);
        try {
            window.localStorage.removeItem(CALCULATION_STORAGE_KEY);
        } catch (cleanupError) {
            console.error('Failed to clear corrupt saved calculation', cleanupError);
        }
        return null;
    }
}

function saveCalculationToStorage(payload) {
    if (!payload || !isLocalStorageAvailable()) {
        return false;
    }

    try {
        const dataToStore = {
            ...payload,
            version: CALCULATION_STORAGE_VERSION,
            savedAt: new Date().toISOString()
        };
        window.localStorage.setItem(CALCULATION_STORAGE_KEY, JSON.stringify(dataToStore));
        latestCalculationPayload = { ...dataToStore };
        return true;
    } catch (error) {
        console.error('Failed to persist calculation to storage', error);
        return false;
    }
}

function clearSavedCalculationStorage() {
    if (isLocalStorageAvailable()) {
        try {
            window.localStorage.removeItem(CALCULATION_STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear stored calculation', error);
        }
    }
    latestCalculationPayload = null;
    isViewingSavedCalculation = false;
}

function applyGearLevelSelections(levels = []) {
    const select = document.getElementById('gearMaterialLevels');
    const dropdown = document.querySelector('#advMaterials .level-dropdown');
    if (!select || !dropdown) {
        return;
    }

    const targetLevels = new Set((Array.isArray(levels) ? levels : []).map(value => parseInt(value, 10)));
    Array.from(select.options).forEach(option => {
        const numericValue = parseInt(option.value, 10);
        const isSelected = targetLevels.has(numericValue);
        option.selected = isSelected;
        const optionDiv = dropdown.querySelector(`div[data-value="${option.value}"]`);
        if (optionDiv) {
            optionDiv.classList.toggle('selected', isSelected);
        }
    });
}

function applySettingsFromStorage(settings = {}, requestedTemplatesOverride = {}) {
    const applyCheckboxState = (id, value) => {
        if (typeof value === 'undefined') {
            return;
        }
        const element = document.getElementById(id);
        if (element) {
            element.checked = Boolean(value);
        }
    };

    if (settings && typeof settings === 'object') {
        if (typeof settings.scale !== 'undefined') {
            const scaleSelect = document.getElementById('scaleSelect');
            if (scaleSelect) {
                const scaleValue = String(settings.scale);
                const match = Array.from(scaleSelect.options).some(option => option.value === scaleValue);
                if (match) {
                    scaleSelect.value = scaleValue;
                }
            }
        }

        applyCheckboxState('includeWarlords', settings.includeWarlords);
        applyCheckboxState('level1OnlyWarlords', settings.level1OnlyWarlords);
        applyCheckboxState('level20OnlyWarlords', settings.level20OnlyWarlords);
        applyCheckboxState('includeLowOdds', settings.includeLowOdds);
        applyCheckboxState('includeMediumOdds', settings.includeMediumOdds);

        if (typeof settings.seasonZeroPreference === 'number' && !Number.isNaN(settings.seasonZeroPreference)) {
            const slider = document.getElementById('seasonZeroPriority');
            if (slider) {
                slider.value = settings.seasonZeroPreference;
                currentSeasonZeroPreference = settings.seasonZeroPreference;
                updateSeasonZeroSliderLabel(settings.seasonZeroPreference);
            }
        }

        if (Array.isArray(settings.gearLevels)) {
            applyGearLevelSelections(settings.gearLevels);
        }

        if (settings.templateQualities && typeof settings.templateQualities === 'object') {
            LEVELS.forEach(level => {
                const select = document.getElementById(`temp${level}`);
                const quality = settings.templateQualities[level] ?? settings.templateQualities[level.toString()];
                if (select && typeof quality === 'string') {
                    select.value = quality;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    qualityMultipliers[level] = getQualityMultiplier(quality);
                }
            });
        }
    }

    const templateTargets = (settings && settings.requestedTemplates) || requestedTemplatesOverride;
    if (templateTargets && typeof templateTargets === 'object') {
        LEVELS.forEach(level => {
            const amountInput = document.getElementById(`templateAmount${level}`);
            if (!amountInput) {
                return;
            }
            const rawValue = templateTargets[level] ?? templateTargets[level.toString()];
            const numericValue = typeof rawValue === 'number' ? rawValue : parseInt(rawValue, 10);
            const wrap = document.querySelector(`.leveltmp${level} .templateAmountWrap`);
            if (!Number.isNaN(numericValue) && numericValue > 0) {
                amountInput.value = numericValue;
                wrap?.classList.add('active');
            } else {
                amountInput.value = '';
                wrap?.classList.remove('active');
            }
        });
    }
}

function resetUserInputs() {
    document.querySelectorAll('.my-material input.numeric-input').forEach(input => {
        input.value = '';
        const parent = input.closest('.my-material');
        if (parent) {
            parent.classList.remove('active');
        }
    });

    LEVELS.forEach(level => {
        const amountInput = document.getElementById(`templateAmount${level}`);
        if (amountInput) {
            amountInput.value = '';
            const wrap = document.querySelector(`.leveltmp${level} .templateAmountWrap`);
            wrap?.classList.remove('active');
        }
        const levelItemsContainer = document.getElementById(`level-${level}-items`);
        if (levelItemsContainer) {
            levelItemsContainer.querySelectorAll('input[type="number"]').forEach(input => {
                input.value = '';
            });
        }
    });
}

function restoreSavedCalculation(savedData) {
    if (!savedData || typeof savedData !== 'object') {
        return false;
    }

    latestCalculationPayload = savedData;

    try {
        initialMaterials = savedData.initialMaterials ? { ...savedData.initialMaterials } : {};
        requestedTemplates = savedData.requestedTemplates ? { ...savedData.requestedTemplates } : {};
        qualityMultipliers = savedData.qualityMultipliers ? { ...savedData.qualityMultipliers } : {};
        failedLevels = Array.isArray(savedData.failedLevels) ? [...savedData.failedLevels] : [];
        pendingFailedLevels = null;
        preserveRequestedTemplates = false;
        ctwMediumNotice = Boolean(savedData.ctwMediumNotice);
        level20OnlyWarlordsActive = Boolean(savedData.level20OnlyWarlordsActive);
        isViewingSavedCalculation = true;

        if (savedData.templates || savedData.initialMaterials) {
            populateInputsFromShare({
                initialMaterials: savedData.initialMaterials || {},
                templates: savedData.templates || {}
            });
        }

        applySettingsFromStorage(savedData.settings || {}, savedData.requestedTemplates || {});

        renderResults(savedData.templateCounts || {}, savedData.materialCounts || {});
        return true;
    } catch (error) {
        console.error('Failed to restore saved calculation', error);
        isViewingSavedCalculation = false;
        latestCalculationPayload = null;
        return false;
    }
}

function handleSaveCalculation(button) {
    if (!button) {
        return;
    }

    if (!latestCalculationPayload) {
        const originalLabel = button.textContent;
        button.textContent = 'Nothing to save';
        button.disabled = true;
        setTimeout(() => {
            button.disabled = false;
            button.textContent = originalLabel;
        }, 1500);
        return;
    }

    if (!isLocalStorageAvailable()) {
        const originalLabel = button.textContent;
        button.textContent = 'Storage unavailable';
        button.disabled = true;
        setTimeout(() => {
            button.disabled = false;
            button.textContent = originalLabel;
        }, 2000);
        return;
    }

    const originalText = button.textContent;
    const success = saveCalculationToStorage(latestCalculationPayload);
    button.disabled = true;
    button.textContent = success ? 'Saved' : 'Save failed';
    setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
    }, success ? 2000 : 2500);
}

function handleClearSavedCalculation() {
    clearSavedCalculationStorage();
    failedLevels = [];
    pendingFailedLevels = null;
    requestedTemplates = {};
    preserveRequestedTemplates = false;
    qualityMultipliers = {};
    remainingUse = {};
    ctwMediumNotice = false;
    level20OnlyWarlordsActive = false;
    closeResults();
    resetUserInputs();
}

const calculationProgressState = {
    total: 0,
    processed: 0
};

function resetCalculationProgress(total) {
    calculationProgressState.total = total;
    calculationProgressState.processed = 0;
    updateCalculationProgress(0, total);
}

function updateCalculationProgress(processed, totalOverride = calculationProgressState.total) {
    calculationProgressState.processed = Math.min(processed, totalOverride);
    const container = document.querySelector('.spinner-progress');
    const track = document.querySelector('.spinner-progress__track');
    const bar = document.querySelector('.spinner-progress__bar');
    const label = document.querySelector('.spinner-progress__label');
    const total = Math.max(totalOverride, 0);

    if (!track || !bar || !label) {
        return;
    }

    const hasTotal = total > 0;
    const ratio = hasTotal ? Math.min(1, processed / total) : 0;
    const percent = Math.round(ratio * 100);

    bar.style.transform = `scaleX(${ratio})`;
    track.setAttribute('aria-valuenow', hasTotal ? percent : 0);
    track.setAttribute('aria-valuemin', 0);
    track.setAttribute('aria-valuemax', 100);
    if (container) {
        container.classList.toggle('is-active', hasTotal);
    }
    label.textContent = hasTotal ? `Calculating templates… ${percent}%` : 'Preparing templates…';
}

function completeCalculationProgress() {
    updateCalculationProgress(calculationProgressState.total, calculationProgressState.total);
}

function clearCalculationProgress() {
    calculationProgressState.total = 0;
    calculationProgressState.processed = 0;
    const container = document.querySelector('.spinner-progress');
    const track = document.querySelector('.spinner-progress__track');
    const bar = document.querySelector('.spinner-progress__bar');
    const label = document.querySelector('.spinner-progress__label');
    if (container) {
        container.classList.remove('is-active');
    }
    if (bar) {
        bar.style.transform = 'scaleX(0)';
    }
    if (track) {
        track.setAttribute('aria-valuenow', 0);
    }
    if (label) {
        label.textContent = 'Preparing templates…';
    }
}

function createProgressTracker(total) {
    resetCalculationProgress(total);
    const chunkSize = Math.max(1, Math.floor(Math.max(total, 100) / 25));
    let processed = 0;

    const tick = async (increment = 1) => {
        processed += increment;
        updateCalculationProgress(processed, total);
        if (processed % chunkSize === 0) {
            await waitForNextFrame();
        }
    };

    const complete = () => {
        processed = total;
        completeCalculationProgress();
    };

    return { tick, complete };
}

function getProductLookupKey(product) {
    return [
        product.level,
        product.season,
        slug(product.name),
        slug(product.setName || 'no-set')
    ].join('|');
}

function closeAllQualitySelects() {
    document.querySelectorAll('.quality-select.open').forEach(wrapper => {
        wrapper.classList.remove('open');
        const trigger = wrapper.querySelector('.quality-select__display');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
}

function updateQualitySelectUI(select, trigger, optionsContainer) {
    if (!select || !trigger || !optionsContainer) return;

    const labelEl = trigger.querySelector('.quality-select__label');
    const swatchEl = trigger.querySelector('.quality-select__swatch');
    const selectedOption = Array.from(select.options).find(opt => opt.value === select.value) || select.options[0];

    if (labelEl && selectedOption) {
        labelEl.textContent = selectedOption.textContent;
    }

    trigger.dataset.qualityValue = select.value || '';

    if (swatchEl) {
        const color = qualityColorMap[select.value];
        if (color) {
            swatchEl.style.backgroundColor = color;
            swatchEl.classList.remove('quality-select__swatch--empty');
        } else {
            swatchEl.style.removeProperty('background-color');
            swatchEl.classList.add('quality-select__swatch--empty');
        }
    }

    optionsContainer.querySelectorAll('.quality-select__option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === select.value);
    });
}

function initializeQualitySelects() {
    const selects = Array.from(document.querySelectorAll('select.temps'))
        .filter(select => /^temp\d+$/.test(select.id || ''));

    selects.forEach(select => {
        if (select.dataset.customSelect === 'true') return;

        select.dataset.customSelect = 'true';

        const wrapper = document.createElement('div');
        wrapper.className = 'quality-select';
        wrapper.dataset.selectId = select.id || '';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'quality-select__display';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', 'Select template quality');
        trigger.dataset.qualityTrigger = select.id || '';

        const swatch = document.createElement('span');
        swatch.className = 'quality-select__swatch quality-select__swatch--empty';
        const label = document.createElement('span');
        label.className = 'quality-select__label';
        const chevron = document.createElement('span');
        chevron.className = 'quality-select__chevron';
        trigger.append(swatch, label, chevron);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'quality-select__options';
        optionsContainer.setAttribute('role', 'listbox');

        Array.from(select.options).forEach(option => {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'quality-select__option';
            optionButton.dataset.value = option.value;
            optionButton.setAttribute('role', 'option');
            optionButton.setAttribute('data-quality', option.value);

            const optionSwatch = document.createElement('span');
            optionSwatch.className = 'quality-select__swatch';
            if (qualityColorMap[option.value]) {
                optionSwatch.style.backgroundColor = qualityColorMap[option.value];
            } else {
                optionSwatch.classList.add('quality-select__swatch--empty');
            }

            const optionLabel = document.createElement('span');
            optionLabel.className = 'quality-select__option-label';
            optionLabel.textContent = option.textContent;

            optionButton.append(optionSwatch, optionLabel);
            if (option.selected) {
                optionButton.classList.add('selected');
            }

            optionsContainer.appendChild(optionButton);
        });

        const parent = select.parentNode;
        parent.insertBefore(wrapper, select);
        wrapper.append(trigger, optionsContainer, select);

        select.classList.add('quality-select__native');
        updateQualitySelectUI(select, trigger, optionsContainer);

        trigger.addEventListener('click', event => {
            event.preventDefault();
            const isOpen = wrapper.classList.contains('open');
            closeAllQualitySelects();
            wrapper.classList.toggle('open', !isOpen);
            trigger.setAttribute('aria-expanded', (!isOpen).toString());
            if (!isOpen) {
                const selectedBtn = optionsContainer.querySelector('.quality-select__option.selected');
                (selectedBtn || optionsContainer.querySelector('.quality-select__option'))?.focus();
            }
        });

        trigger.addEventListener('keydown', event => {
            if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                const isOpen = wrapper.classList.contains('open');
                if (!isOpen) {
                    closeAllQualitySelects();
                    wrapper.classList.add('open');
                    trigger.setAttribute('aria-expanded', 'true');
                }
                const options = Array.from(optionsContainer.querySelectorAll('.quality-select__option'));
                if (!options.length) return;
                if (event.key === 'ArrowUp') {
                    (optionsContainer.querySelector('.quality-select__option.selected') || options[options.length - 1])?.focus();
                } else {
                    (optionsContainer.querySelector('.quality-select__option.selected') || options[0])?.focus();
                }
            }
        });

        optionsContainer.addEventListener('click', event => {
            const optionButton = event.target.closest('.quality-select__option');
            if (!optionButton) return;
            event.preventDefault();
            const { value } = optionButton.dataset;
            if (value && select.value !== value) {
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                updateQualitySelectUI(select, trigger, optionsContainer);
            }
            wrapper.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
        });

        optionsContainer.addEventListener('keydown', event => {
            const optionButton = event.target.closest('.quality-select__option');
            if (!optionButton) return;

            const options = Array.from(optionsContainer.querySelectorAll('.quality-select__option'));
            const currentIndex = options.indexOf(optionButton);

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                const next = options[currentIndex + 1] || options[0];
                next.focus();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                const prev = options[currentIndex - 1] || options[options.length - 1];
                prev.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                optionButton.click();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                wrapper.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.focus();
            }
        });

        select.addEventListener('change', () => {
            updateQualitySelectUI(select, trigger, optionsContainer);
        });
    });

    if (!qualitySelectHandlersAttached) {
        document.addEventListener('click', event => {
            if (!event.target.closest('.quality-select')) {
                closeAllQualitySelects();
            }
        });

        qualitySelectHandlersAttached = true;
    }
}

function getSeasonZeroPreference() {
    return currentSeasonZeroPreference;
}

function updateSeasonZeroSliderLabel(value) {
    const sliderEl = document.getElementById('seasonZeroPriority');
    if (!sliderEl) return;
    const normalized = Number.isInteger(value) ? value : SeasonZeroPreference.NORMAL;
    const valueText = seasonZeroValueText[normalized] || seasonZeroValueText[SeasonZeroPreference.NORMAL];
    sliderEl.setAttribute('aria-valuetext', valueText);
}

function initializeSeasonZeroSlider() {
    const slider = document.getElementById('seasonZeroPriority');
    if (!slider) return;

    const initialValue = parseInt(slider.value, 10);
    const safeValue = Number.isNaN(initialValue) ? SeasonZeroPreference.NORMAL : initialValue;
    currentSeasonZeroPreference = safeValue;
    slider.value = safeValue;
    updateSeasonZeroSliderLabel(safeValue);

    const handleChange = (event) => {
        const value = parseInt(event.target.value, 10);
        if (Number.isNaN(value)) {
            return;
        }
        currentSeasonZeroPreference = value;
        updateSeasonZeroSliderLabel(value);
    };

    slider.addEventListener('input', handleChange);
    slider.addEventListener('change', handleChange);
}

function applySeasonZeroPreference(products, preference) {
    if (!Array.isArray(products)) return [];
    if (preference === SeasonZeroPreference.OFF) {
        return products.filter(product => product.season !== 0);
    }
    return products;
}

document.addEventListener('DOMContentLoaded', function() {
    initializeUpdateLog();
    createLevelStructure();
    addCalculateButton();
        formatedInputNumber();
        inputActive();
        initAdvMaterialSection();
        initializeQualitySelects();
        initializeSeasonZeroSlider();

    const shareParam = urlParams.get('share');
    if (shareParam) {
        try {
            const data = JSON.parse(atob(shareParam));
            initialMaterials = data.initialMaterials || {};
            populateInputsFromShare(data);
            // Show loading overlay before automatic calculation
            document.querySelector('.spinner-wrap').classList.add('active');
            // Automatically trigger calculation based on the populated inputs
            calculateMaterials();
        } catch (e) {
            console.error('Invalid share data');
        }
    } else {
        const savedCalculation = loadSavedCalculation();
        if (savedCalculation) {
            const restored = restoreSavedCalculation(savedCalculation);
            if (!restored) {
                clearSavedCalculationStorage();
                resetUserInputs();
            }
        }
    }

    // Kun footerin sisällä olevaa SVG:tä painetaan
    document.querySelectorAll('footer svg, #openGiftFromHeader').forEach(element => {
		element.addEventListener('click', function() {
			const pageDivs = document.querySelectorAll('.wrapper > div');
			const giftDiv = document.querySelector('.wrapper .gift');

			pageDivs.forEach(div => {
				div.style.display = 'none';
			});
			giftDiv.style.display = 'flex';
			gtag('event', 'donate_click', {
				'event_label_gift': 'Open domnate views'
			});
		});
	});

    document.querySelector('.gift button').addEventListener('click', function() {
        const pageDivs = document.querySelectorAll('.wrapper > div');
        const wrapperDiv = document.querySelector('#generatebychoice');

        pageDivs.forEach(div => {
            div.style.display = 'none';
        });

        wrapperDiv.style.display = 'block';
    });

    const ctwBtn = document.getElementById('ctwInfoBtn');
    const ctwPopup = document.getElementById('ctwInfoPopup');
    ctwBtn?.addEventListener('click', () => {
        if (ctwPopup) {
            ctwPopup.style.display = 'flex';
        }
    });
    ctwPopup?.addEventListener('click', (e) => {
        if (e.target === ctwPopup || e.target.closest('.close-popup')) {
            ctwPopup.style.display = 'none';
        }
    });

    const oddsBtn = document.getElementById('oddsInfoBtn');
    const oddsPopup = document.getElementById('oddsInfoPopup');
    oddsBtn?.addEventListener('click', () => {
        if (oddsPopup) {
            oddsPopup.style.display = 'flex';
        }
    });
    oddsPopup?.addEventListener('click', (e) => {
        if (e.target === oddsPopup || e.target.closest('.close-popup')) {
            oddsPopup.style.display = 'none';
        }
    });

    const gearBtn = document.getElementById('gearLevelsInfoBtn');
    const gearPopup = document.getElementById('gearLevelsInfoPopup');
    gearBtn?.addEventListener('click', () => {
        if (gearPopup) {
            gearPopup.style.display = 'flex';
        }
    });
    gearPopup?.addEventListener('click', (e) => {
        if (e.target === gearPopup || e.target.closest('.close-popup')) {
            gearPopup.style.display = 'none';
        }
    });

    const seasonZeroBtn = document.getElementById('seasonZeroInfoBtn');
    const seasonZeroPopup = document.getElementById('seasonZeroInfoPopup');
    seasonZeroBtn?.addEventListener('click', () => {
        if (seasonZeroPopup) {
            seasonZeroPopup.style.display = 'flex';
        }
    });
    seasonZeroPopup?.addEventListener('click', (e) => {
        if (e.target === seasonZeroPopup || e.target.closest('.close-popup')) {
            seasonZeroPopup.style.display = 'none';
        }
    });

    const materialsInfoBtn = document.getElementById('yourMaterialsInfoBtn');
    const materialsInfoPopup = document.getElementById('yourMaterialsInfoPopup');
    materialsInfoBtn?.addEventListener('click', () => {
        if (materialsInfoPopup) {
            materialsInfoPopup.style.display = 'flex';
        }
    });
    materialsInfoPopup?.addEventListener('click', (e) => {
        if (e.target === materialsInfoPopup || e.target.closest('.close-popup')) {
            materialsInfoPopup.style.display = 'none';
        }
    });

    const scaleBtn = document.getElementById('scaleInfoBtn');
    const scalePopup = document.getElementById('scaleInfoPopup');
    scaleBtn?.addEventListener('click', () => {
        if (scalePopup) {
            scalePopup.style.display = 'flex';
        }
    });
    scalePopup?.addEventListener('click', (e) => {
        if (e.target === scalePopup || e.target.closest('.close-popup')) {
            scalePopup.style.display = 'none';
        }
    });

    const templatesBtn = document.getElementById('templatesInfoBtn');
    const templatesPopup = document.getElementById('templatesInfoPopup');
    templatesBtn?.addEventListener('click', () => {
        if (templatesPopup) {
            templatesPopup.style.display = 'flex';
        }
    });
    templatesPopup?.addEventListener('click', (e) => {
        if (e.target === templatesPopup || e.target.closest('.close-popup')) {
            templatesPopup.style.display = 'none';
        }
    });

    // Trigger calculation when pressing Enter on any input
    document.addEventListener('keydown', e => {
        const activeEl = document.activeElement;
        const tag = activeEl ? activeEl.tagName : '';
        const isQualityTrigger = activeEl?.classList?.contains('quality-select__display');
        if (e.key === 'Enter' && (['INPUT', 'SELECT'].includes(tag) || isQualityTrigger) &&
            document.getElementById('results').style.display === 'none') {
            const manualVisible = document.getElementById('manualInput').style.display !== 'none';
            const choiceVisible = document.getElementById('generatebychoice').style.display !== 'none';
            if (choiceVisible) {
                calculateWithPreferences();
            } else if (manualVisible) {
                calculateMaterials();
            }
        }

        if (e.key === 'Escape') {
            if (document.getElementById('results').style.display === 'block') {
                closeResults();
            }
            document.querySelectorAll('.info-overlay').forEach(overlay => {
                if (overlay.style.display !== 'none') {
                    overlay.style.display = 'none';
                }
            });
            closeAllQualitySelects();
        }
    });

    // Custom tab order for template amount inputs and quality selects
    const templateInputs = LEVELS.map(l => document.getElementById(`templateAmount${l}`)).filter(Boolean);
    const templateSelects = LEVELS.map(l => document.getElementById(`temp${l}`)).filter(Boolean);
    const qualityTriggers = templateSelects
        .map(select => select.closest('.quality-select')?.querySelector('.quality-select__display'))
        .filter(Boolean);

    templateInputs.forEach((input, idx) => {
        input.addEventListener('keydown', e => {
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                const next = templateInputs[idx + 1];
                if (next) {
                    next.focus();
                } else if (qualityTriggers[0]) {
                    qualityTriggers[0].focus();
                }
            }
        });
    });

    qualityTriggers.forEach((trigger, idx) => {
        trigger.addEventListener('keydown', e => {
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                const next = qualityTriggers[idx + 1];
                if (next) {
                    next.focus();
                } else {
                    const firstMat = document.querySelector('.my-material input[type="text"]');
                    if (firstMat) firstMat.focus();
                }
            }
        });
    });

});

function formatPlaceholderWithCommas(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatedInputNumber(){
        document.addEventListener('input', function(e) {
            if (e.target.classList.contains('numeric-input')) {
                let inputValue = e.target.value;

                // Salli numerot, pilkut ja pisteet desimaaleille
                let numericValue = inputValue.replace(/[^0-9.,]/g, '');

                // Erottele desimaaliosa, jos sellainen on
                let parts = numericValue.split('.');
                let integerPart = parts[0].replace(/,/g, '');
                integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

                e.target.value = parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
            }
        });

}

function getQualityMultiplier(levelName) {
    const order = ['poor', 'common', 'fine', 'exquisite', 'epic', 'legendary'];
    const idx = order.indexOf(levelName.toLowerCase());
    return Math.pow(4, idx >= 0 ? idx : 0);
}


function setTemplateValues(templates) {
    // Tyhjennä ensin kaikki aikaisemmat valinnat
    document.querySelectorAll('#manualInput input[type="number"]').forEach(input => {
        input.value = ''; // Nollaa kaikki input-kentät
    });

    // Aseta sitten uudet arvot
    Object.entries(templates).forEach(([level, items]) => {
        Object.entries(items).forEach(([itemName, amount]) => {
            const slugName = slug(itemName);
            const inputElement = document.querySelector(`input[name^="${slugName}_"]`);
            if (inputElement) {
                inputElement.value = amount;
            }
        });
    });
}

function populateInputsFromShare(data) {
    // Fill material amounts
    if (data.initialMaterials) {
        Object.entries(data.initialMaterials).forEach(([name, amt]) => {
            const input = document.getElementById(`my-${slug(name)}`);
            if (input) {
                input.value = formatPlaceholderWithCommas(amt);
                const parent = input.closest('.my-material');
                if (parent) parent.classList.add('active');
            }
        });
    }

    if (data.templates) {
        const qualityMap = {
            1: 'poor',
            4: 'common',
            16: 'fine',
            64: 'exquisite',
            256: 'epic',
            1024: 'legendary'
        };

        Object.entries(data.templates).forEach(([level, items]) => {
            let total = 0;
            let quality = null;
            items.forEach(item => {
                const selector = `#level-${level}-items input[name="${slug(item.name)}_${item.season}_${slug(item.setName || 'no-set')}"]`;
                const el = document.querySelector(selector);
                if (el) {
                    el.value = item.amount;
                }
                total += item.amount;
                if (!quality && item.multiplier) {
                    quality = qualityMap[item.multiplier];
                }
            });
            if (total > 0) {
                const amountInput = document.getElementById(`templateAmount${level}`);
                if (amountInput) {
                    amountInput.value = total;
                    const wrap = document.querySelector(`.leveltmp${level} .templateAmountWrap`);
                    if (wrap) wrap.classList.add('active');
                }
            }
            if (quality) {
                const sel = document.getElementById(`temp${level}`);
                if (sel) {
                    sel.value = quality;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        // Estimate gear levels
        const gearLevels = [];
        Object.entries(data.templates).forEach(([lvl, items]) => {
            const levelNum = parseInt(lvl, 10);
            if (levelNum !== 1 && items.some(it => it.season !== 0 || it.warlord)) {
                gearLevels.push(levelNum);
            }
        });

        const select = document.getElementById('gearMaterialLevels');
        const dropdown = document.querySelector('#advMaterials .level-dropdown');
        if (select && dropdown) {
            Array.from(select.options).forEach(opt => {
                const isSel = gearLevels.includes(parseInt(opt.value, 10));
                opt.selected = isSel;
                const divOpt = dropdown.querySelector(`div[data-value="${opt.value}"]`);
                if (divOpt) divOpt.classList.toggle('selected', isSel);
            });
        }
    }
    if (history.replaceState) {
        const url = new URL(window.location);
        url.searchParams.delete('share');
        history.replaceState({}, '', url.pathname + url.search);
    }
}

// Oletetaan, että addCalculateButton-funktio on jo määritelty ja se lisää sekä Laske että Generoi 480 -napit
function addCalculateButton() {
    const manualInputDiv = document.getElementById('manualInput');
	const generatebychoice = document.getElementById('generatebychoice');
    
    const calculateBtn = document.createElement('button');
    calculateBtn.textContent = 'Calculate';
	calculateBtn.classList.add('calculate-button'); 
    calculateBtn.addEventListener('click', calculateMaterials);
    manualInputDiv.appendChild(calculateBtn);
}

// Funktio tulosten näyttämiseen (modifioi tämä toimimaan haluamallasi tavalla)
function showResults() {
        document.getElementById('results').style.display = 'block';
        document.getElementById('generatebychoice').style.display = 'none';
        window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });

    document.querySelector('.spinner-wrap').classList.remove('active');
    clearCalculationProgress();

}

function closeResults() {
	const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = ''; // Tyhjennä aiemmat tulokset
	document.getElementById('results').style.display = 'none';
	document.getElementById('generatebychoice').style.display = 'block';
	initialMaterials = {}; // Reset materials to allow fresh input values
}

function createCloseButton(parentElement) {
    const closeButton = document.createElement('button');
    closeButton.id = 'closeResults';
    closeButton.onclick = closeResults;
    closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"/></svg>`;
    parentElement.appendChild(closeButton);
}

function createResultsActions(parentElement) {
    if (!parentElement) {
        return;
    }

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'results-actions';

    const storageAvailable = isLocalStorageAvailable();

    if (!isViewingSavedCalculation && storageAvailable) {
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'results-actions__button results-actions__save';
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', () => handleSaveCalculation(saveButton));
        actionsContainer.appendChild(saveButton);
    }

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'results-actions__button results-actions__clear';
    clearButton.textContent = 'Clear calculation';
    clearButton.addEventListener('click', handleClearSavedCalculation);
    actionsContainer.appendChild(clearButton);

    parentElement.appendChild(actionsContainer);
}


function createLevelStructure() {
    const manualInputDiv = document.getElementById('manualInput');
    //manualInputDiv.style.display = 'block'; // Aseta näkyväksi

    LEVELS.forEach(level => {
        const levelHeader = document.createElement('h3');
        levelHeader.textContent = `Level ${level}`;
        levelHeader.style.cursor = 'pointer'; // Osoittaa, että elementtiä voi klikata
        manualInputDiv.appendChild(levelHeader);

        const itemsDiv = document.createElement('div');
        itemsDiv.id = `level-${level}-items`;
        // Aseta Level 1 näkyväksi ja muut piiloon
        if (level === 1) {
            itemsDiv.style.display = 'block'; // Aseta Level 1 itemit näkyviksi
        } else {
            itemsDiv.style.display = 'none'; // Muut tasot piiloon oletuksena
        }
        manualInputDiv.appendChild(itemsDiv);

        // Togglea itemsDivin näkyvyyttä klikattaessa
        levelHeader.addEventListener('click', () => {
            itemsDiv.style.display = itemsDiv.style.display === 'none' ? 'block' : 'none';
        });

        // Lisää kunkin tason itemit niiden containeriin
        const levelProducts = productsByLevel[level] || [];
        levelProducts.forEach(product => {
            const productDiv = document.createElement('div');
            const label = document.createElement('label');
            if (product.season === 0) {
                label.textContent = product.name;
            } else {
                label.textContent = `${product.name} - ${product.setName} (S${product.season})`;
            }
            const input = document.createElement('input');
            input.type = 'number';
            const nameSlug = slug(product.name);
            const setSlug = slug(product.setName || 'no-set');
            input.name = `${nameSlug}_${product.season}_${setSlug}`;
            input.dataset.productKey = getProductLookupKey(product);
            input.placeholder = 'amount';

            productDiv.appendChild(label);
            productDiv.appendChild(input);
            itemsDiv.appendChild(productDiv);
        });
    });
}

function calculateMaterials() {
    isViewingSavedCalculation = false;
    latestCalculationPayload = null;
    const hasPendingFailures = Array.isArray(pendingFailedLevels);
    if (hasPendingFailures) {
        failedLevels = [...pendingFailedLevels];
        pendingFailedLevels = null;
    } else {
        failedLevels = [];
    }

    const shouldPreserveRequested = preserveRequestedTemplates;
    preserveRequestedTemplates = false;

    if (!shouldPreserveRequested) {
        requestedTemplates = {};
    }
    qualityMultipliers = {};
    const manualRequestedTotals = {};

    LEVELS.forEach(level => {
        const qualitySelect = document.getElementById(`temp${level}`);
        if (!qualitySelect) {
            return;
        }

        const selectedQuality = typeof qualitySelect.value === 'string' ? qualitySelect.value.trim() : '';
        const qualityKey = selectedQuality !== '' ? selectedQuality : 'poor';
        qualityMultipliers[level] = getQualityMultiplier(qualityKey);
    });

    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = ''; // Tyhjennä aiemmat tulokset

    const materialsDiv = document.createElement('div');
    materialsDiv.className = 'materials';

    // Täytä materialsDiv materiaalien tiedoilla...

    const templateCounts = { 1: [], 5: [], 10: [], 15: [], 20: [], 25: [], 30: [], 35: [], 40: [], 45: [] };
    const materialCounts = {};
    
    // Kerää tiedot kaikista syötetyistä itemeistä
    document.querySelectorAll('div[id^="level-"]').forEach(levelDiv => {
        const level = parseInt(levelDiv.id.split('-')[1]);
        levelDiv.querySelectorAll('input[type="number"]').forEach(input => {
            const amount = parseInt(input.value) || 0;
            const productKey = input.dataset.productKey;
            let product = productKey ? productLookup.get(productKey) : null;

            if (!product && input.name) {
                const [nameSlug, seasonStr, setSlug] = input.name.split('_');
                const season = parseInt(seasonStr, 10);
                product = (productsByLevel[level] || []).find(p =>
                    slug(p.name) === nameSlug &&
                    p.season === season &&
                    slug(p.setName || 'no-set') === setSlug
                ) || null;
            }

            if (product && amount > 0) {
                templateCounts[level].push({
                    name: product.name,
                    amount: amount,
                    img: product.img,
                    materials: product.materials,
                    multiplier: qualityMultipliers[level] || 1,
                    setName: product.setName,
                    season: product.season,
                    warlord: product.warlord || false
                });
                Object.entries(product.materials).forEach(([rawName, requiredAmount]) => {
                    const materialName = materialKeyMap[normalizeKey(rawName)] || rawName;

                    if (!materialCounts[materialName]) {
                        materialCounts[materialName] = {
                            amount: 0,
                            img: allMaterials[materialName] ? allMaterials[materialName].img : ''
                        };
                    }
                    const multiplier = qualityMultipliers[level] || 1;
                    materialCounts[materialName].amount += requiredAmount * amount * multiplier;
                });

                if (!shouldPreserveRequested) {
                    manualRequestedTotals[level] = (manualRequestedTotals[level] || 0) + amount;
                }
            }
        });
    });

    if (!shouldPreserveRequested) {
        LEVELS.forEach(level => {
            requestedTemplates[level] = manualRequestedTotals[level] || 0;
        });
    }
    renderResults(templateCounts, materialCounts);
}

function getCurrentUserSettings() {
    const scaleSelect = document.getElementById('scaleSelect');
    const parseCheckbox = (id, fallback = false) => {
        const element = document.getElementById(id);
        if (element === null) {
            return fallback;
        }
        return element.checked;
    };

    const gearSelect = document.getElementById('gearMaterialLevels');
    const gearLevels = gearSelect
        ? Array.from(gearSelect.selectedOptions).map(option => parseInt(option.value, 10))
        : [];

    const templateQualities = {};
    LEVELS.forEach(level => {
        const select = document.getElementById(`temp${level}`);
        if (select) {
            templateQualities[level] = select.value;
        }
    });

    return {
        scale: scaleSelect ? scaleSelect.value : '1',
        includeWarlords: parseCheckbox('includeWarlords', true),
        level1OnlyWarlords: parseCheckbox('level1OnlyWarlords', false),
        level20OnlyWarlords: parseCheckbox('level20OnlyWarlords', false),
        includeLowOdds: parseCheckbox('includeLowOdds', true),
        includeMediumOdds: parseCheckbox('includeMediumOdds', true),
        seasonZeroPreference: getSeasonZeroPreference(),
        gearLevels,
        templateQualities,
        requestedTemplates: { ...requestedTemplates }
    };
}

function renderResults(templateCounts, materialCounts) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    remainingUse = {};
    const previousSavedAt =
        isViewingSavedCalculation && latestCalculationPayload && latestCalculationPayload.savedAt
            ? latestCalculationPayload.savedAt
            : undefined;
    if (!isViewingSavedCalculation) {
        latestCalculationPayload = null;
    }

    const materialsDiv = document.createElement('div');
    materialsDiv.className = 'materials';

    const materialsShortage = failedLevels.length > 0 && failedLevels.some(level => (requestedTemplates[level] || 0) > 0);
    if (materialsShortage) {
        const warningBanner = document.createElement('div');
        warningBanner.className = 'materials-warning';
        warningBanner.innerHTML = '<strong>Materials depleted.</strong> Not every requested template could be generated with the available stock.';
        resultsDiv.appendChild(warningBanner);
    }

    const initialMaterialMap = getNormalizedKeyMap(initialMaterials);

    Object.entries(materialCounts)
        .sort(([aName], [bName]) => {
            const seasonA = materialToSeason[aName] || 0;
            const seasonB = materialToSeason[bName] || 0;
            if (seasonA !== seasonB) {
                return seasonA - seasonB;
            }
            return aName.localeCompare(bName);
        })
        .forEach(([materialName, data]) => {
            const materialContainer = document.createElement('div');
            const img = document.createElement('img');
            img.src = data.img;
            img.alt = materialName;
            materialContainer.appendChild(img);

            const pMatName = document.createElement('p');
            const pMatAmount = document.createElement('p');
            const pRemaining = document.createElement('p');
            const pAvailableMaterials = document.createElement('p');
            const pSeason = document.createElement('p');
            pMatName.className = 'material-name';
            pMatAmount.className = 'amount';
            pRemaining.className = 'remaining-to-use';
            pAvailableMaterials.className = 'available-materials';
            pSeason.className = 'season-id';

            let matText = allMaterials[materialName] ? allMaterials[materialName]["Original-name"] || materialName : materialName;
            const matSeason = materialToSeason[materialName] || 0;
            if (matSeason !== 0) {
                pSeason.textContent = `Season ${matSeason}`;
            }
            pMatName.textContent = matText;
            pMatAmount.textContent = `-${new Intl.NumberFormat('en-US').format(data.amount)}`;
            pRemaining.textContent = pMatAmount.textContent;
            remainingUse[materialName] = data.amount;
            const matchedKey = initialMaterialMap[normalizeKey(materialName)];
            const originalAmount = matchedKey ? initialMaterials[matchedKey] : 0;
            if (originalAmount > 0) {
                const remainingAmount = originalAmount - data.amount;
                pAvailableMaterials.textContent = `${new Intl.NumberFormat('en-US').format(Math.max(remainingAmount, 0))}`;
            }

            materialContainer.dataset.material = materialName;
            if (matSeason !== 0) {
                materialContainer.appendChild(pSeason);
            }
            materialContainer.appendChild(pMatName);
            materialContainer.appendChild(pMatAmount);
            materialContainer.appendChild(pRemaining);
            materialContainer.appendChild(pAvailableMaterials);

            materialsDiv.appendChild(materialContainer);
        });

    if (materialsDiv.children.length === 0) {
        const msg = document.createElement('h3');
        msg.textContent = 'No items could be crafted with the available materials';
        resultsDiv.appendChild(msg);
        createCloseButton(resultsDiv);
        showResults();
        return;
    }

    resultsDiv.appendChild(materialsDiv);

    const generateDiv = document.createElement('div');
    generateDiv.className = 'generate';

    const levelItemCounts = calculateTotalItemsByLevel(templateCounts);
    const allSameCount = areAllCountsSame(levelItemCounts);
    const totalItems = Object.values(levelItemCounts).reduce((sum, c) => sum + c, 0);
    const allFailed = totalItems === 0;

    if (allFailed) {
        const msg = document.createElement('h3');
        msg.textContent = 'No items could be crafted with the available materials';
        resultsDiv.appendChild(msg);
        createCloseButton(resultsDiv);
        showResults();
        return;
    }

    if (allSameCount && levelItemCounts["1"] > 0) {
        const totalTemplatesHeader = document.createElement('h2');
        totalTemplatesHeader.textContent = `Total templates: ${new Intl.NumberFormat('en-US').format(levelItemCounts["1"])} pcs`;
        if (!isDebugMode){
            gtag('event', 'total_templates', {
                'event_total_templates': levelItemCounts,
                'value': 1
            });
        }
        materialsDiv.after(totalTemplatesHeader);
        totalTemplatesHeader.after(generateDiv);
    } else {
        materialsDiv.after(generateDiv);
    }

    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'items';

    const itemsInfoBtn = document.createElement('button');
    itemsInfoBtn.id = 'itemsInfoBtn';
    itemsInfoBtn.className = 'info-btn';
    itemsInfoBtn.setAttribute('aria-label', 'Items info');
    itemsInfoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336c-13.3 0-24 10.7-24 24s10.7 24 24 24l80 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-8 0 0-88c0-13.3-10.7-24-24-24l-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l24 0 0 64-24 0zm40-144a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/></svg>`;

    const itemsInfoPopup = document.createElement('div');
    itemsInfoPopup.id = 'itemsInfoPopup';
    itemsInfoPopup.className = 'info-overlay';
    itemsInfoPopup.innerHTML = `<div class="info-content"><button class="close-popup" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"/></svg></button><p>Click an item once it is crafted. Completed items fade, making it easy to see what is still missing.</p></div>`;

    itemsInfoBtn.addEventListener('click', () => {
        itemsInfoPopup.style.display = 'flex';
    });
    itemsInfoPopup.addEventListener('click', (e) => {
        if (e.target === itemsInfoPopup || e.target.closest('.close-popup')) {
            itemsInfoPopup.style.display = 'none';
        }
    });

    // itemsDiv placement adjusted later after copy button

    let firstLevelHeader = true;
    Object.entries(templateCounts).forEach(([level, templates]) => {
        const lvl = parseInt(level, 10);
        if (templates.length > 0 || (failedLevels.includes(lvl) && requestedTemplates[lvl] > 0)) {
            const levelHeader = document.createElement('h4');
            levelHeader.textContent = allSameCount ? `Level ${level}` : `Level ${level} (${new Intl.NumberFormat('en-US').format(levelItemCounts[level])} pcs)`;


            if (firstLevelHeader) {
                const headerWrap = document.createElement('div');
                headerWrap.className = 'items-header';
                headerWrap.appendChild(levelHeader);
                headerWrap.appendChild(itemsInfoBtn);
                itemsDiv.appendChild(headerWrap);
                firstLevelHeader = false;
            } else {
                itemsDiv.appendChild(levelHeader);
            }

            if (lvl === 20 && ctwMediumNotice && !level20OnlyWarlordsActive) {
                const extraInfo = document.createElement('p');
                extraInfo.className = 'craft-extra-info';
                extraInfo.textContent = "Medium odds items were used because otherwise no items would be generated. At level 20, Ceremonial Targaryen Warlord items are categorized as 'medium odds'.";
                itemsDiv.appendChild(extraInfo);
            }
            const levelGroup = document.createElement('div');
            levelGroup.className = 'level-group';
            itemsDiv.appendChild(levelGroup);

            if (templates.length > 0) {
                templates.forEach(template => {
                    const templateDiv = document.createElement('div');
                    templateDiv.classList.add('item');
                    if (template.warlord) {
                        templateDiv.classList.add('item-ctw');
                    }
                    const img = document.createElement('img');
                    img.src = template.img;
                    img.alt = template.name;
                    templateDiv.appendChild(img);

                    let pSeasonInfo;
                    let pSetName;
                    const displaySeason = template.warlord ? 3 : template.season;
                    if (displaySeason && displaySeason !== 0) {
                        pSeasonInfo = document.createElement('p');
                        pSeasonInfo.className = 'season-info';
                        pSeasonInfo.textContent = `Season ${displaySeason}`;

                        pSetName = document.createElement('p');
                        pSetName.className = 'set-name';
                        pSetName.textContent = template.setName || '';
                    }

                    const pTemplateName = document.createElement('p');
                    const pTemplateamount = document.createElement('p');
                    pTemplateName.className = 'name';
                    pTemplateamount.className = 'amount';

                    pTemplateName.textContent = `${template.name}`;
                    pTemplateamount.textContent = `${new Intl.NumberFormat('en-US').format(template.amount)}`;

                    if (displaySeason && displaySeason !== 0) {
                        templateDiv.appendChild(pSeasonInfo);
                        templateDiv.appendChild(pSetName);
                    }

                    templateDiv.appendChild(pTemplateName);
                    templateDiv.appendChild(pTemplateamount);

                    const matsDiv = document.createElement('div');
                    matsDiv.className = 'item-mats';
                    const materialUsage = {};
                    Object.entries(template.materials).forEach(([mat, amt]) => {
                        const totalAmt = amt * template.amount * (template.multiplier || 1);
                        materialUsage[mat] = totalAmt;
                        const pLine = document.createElement('p');
                        pLine.className = 'item-material';
                        pLine.innerHTML = `${mat} <span>${new Intl.NumberFormat('en-US').format(totalAmt)}</span>`;
                        matsDiv.appendChild(pLine);
                    });
                    templateDiv.dataset.materials = JSON.stringify(materialUsage);
                    templateDiv.appendChild(matsDiv);

                    templateDiv.addEventListener('click', function() {
                        this.classList.toggle('opacity');
                        const used = JSON.parse(this.dataset.materials);
                        const done = this.classList.contains('opacity');
                        Object.entries(used).forEach(([mat, amt]) => {
                            if (done) {
                                remainingUse[mat] -= amt;
                            } else {
                                remainingUse[mat] += amt;
                            }
                            const target = materialsDiv.querySelector(`div[data-material="${mat}"] .remaining-to-use`);
                            if (target) {
                                target.textContent = `-${new Intl.NumberFormat('en-US').format(remainingUse[mat])}`;
                            }
                        });
                    });

                    levelGroup.appendChild(templateDiv);
                });
            } else {
                const msg = document.createElement('p');
                msg.className = 'no-products';
                msg.textContent = 'No items could be crafted with the available materials';
                levelGroup.appendChild(msg);
            }
        }
    });

    // Prepare a lighter share payload containing only the user inputs
    const minimalTemplates = {};
    Object.entries(templateCounts).forEach(([lvl, items]) => {
        minimalTemplates[lvl] = items.map(({ name, amount, setName, season, multiplier, warlord }) => ({
            name,
            amount,
            setName,
            season,
            multiplier,
            warlord
        }));
    });

    const templateCountsSnapshot = JSON.parse(JSON.stringify(templateCounts));
    const materialCountsSnapshot = JSON.parse(JSON.stringify(materialCounts));
    const minimalTemplatesSnapshot = JSON.parse(JSON.stringify(minimalTemplates));
    const initialMaterialsSnapshot = JSON.parse(JSON.stringify(initialMaterials));
    const requestedTemplatesSnapshot = { ...requestedTemplates };
    const qualityMultipliersSnapshot = { ...qualityMultipliers };
    const payload = {
        templateCounts: templateCountsSnapshot,
        materialCounts: materialCountsSnapshot,
        templates: minimalTemplatesSnapshot,
        initialMaterials: initialMaterialsSnapshot,
        requestedTemplates: requestedTemplatesSnapshot,
        qualityMultipliers: qualityMultipliersSnapshot,
        settings: getCurrentUserSettings(),
        failedLevels: [...failedLevels],
        ctwMediumNotice,
        level20OnlyWarlordsActive
    };
    if (previousSavedAt) {
        payload.savedAt = previousSavedAt;
    }
    latestCalculationPayload = payload;

    generateDiv.after(itemsDiv);
    itemsDiv.after(itemsInfoPopup);
    createResultsActions(resultsDiv);
    createCloseButton(resultsDiv);

    const seasonTotals = {};
    let totalBasicMat = 0;
    let totalAllSeason = 0;
    Object.entries(materialCounts).forEach(([name, data]) => {
        const season = materialToSeason[name] || 0;
        if (season === 0) {
            totalBasicMat += data.amount;
        } else {
            seasonTotals[season] = (seasonTotals[season] || 0) + data.amount;
            totalAllSeason += data.amount;
        }
    });

    const nf = new Intl.NumberFormat('fi-FI');
    console.log(`Käytetty perusmateriaali: ${nf.format(totalBasicMat)}`);
    Object.keys(seasonTotals)
        .sort((a, b) => a - b)
        .forEach(season => {
            console.log(`Käytetty materiaali Season ${season}: ${nf.format(seasonTotals[season])}`);
        });
    console.log(`Käytetty Gear materiaali yhteensä: ${nf.format(totalAllSeason)}`);

    showResults();
}

function calculateTotalItemsByLevel(templateCounts) {
    let totalItemsByLevel = {};

    // Käydään läpi jokainen taso templateCounts-objektissa
    Object.keys(templateCounts).forEach(level => {
        // Laske tämän tason kaikkien templatejen määrät yhteen
        const totalItems = templateCounts[level].reduce((sum, template) => sum + template.amount, 0);
        totalItemsByLevel[level] = totalItems;
    });

    return totalItemsByLevel;
}

function areAllCountsSame(levelItemCounts) {
    const counts = Object.values(levelItemCounts);
    return counts.every(count => count === counts[0]);
}

function createMaterialImageElement(materialName, imgUrl, preference) {
    const imgElement = document.createElement('img');
    imgElement.src = imgUrl;
    imgElement.alt = materialName;
    imgElement.className = 'material-image';
    imgElement.dataset.materialName = materialName;
    imgElement.dataset.preference = preference;

    imgElement.addEventListener('click', function() {
        this.classList.toggle('selected');
        // Täällä voit lisätä logiikkaa valintojen tallentamiseen tai käsittelyyn
    });

    return imgElement;
}

async function calculateWithPreferences() {
    isViewingSavedCalculation = false;
    latestCalculationPayload = null;
    const templateAmountInputs = LEVELS.map(l => document.querySelector(`#templateAmount${l}`));
    let isValid = true;
        let hasValue = false;

        templateAmountInputs.forEach(input => {
		const val = parseInt(input.value.replace(/,/g, ''), 10);
		if (!isNaN(val)) {
				if (val > 0) {
						hasValue = true;
				}
				if (val < 0) {
						isValid = false;
						input.classList.add('missing-input');
						setTimeout(() => {
								input.classList.remove('missing-input');
						}, 3000);
				}
		}
	});

	 if (!hasValue) {
		isValid = false;
		templateAmountInputs.forEach(input => {
				input.classList.add('missing-input');
				setTimeout(() => {
						input.classList.remove('missing-input');
				}, 3000);
		});
        }
        if (!isValid) {
                return; // Estä laskennan suoritus
        }

        document.querySelector('.spinner-wrap').classList.add('active');
        await waitForNextFrame();

        try {
                let availableMaterials = gatherMaterialsFromInputs();
                availableMaterials = sanitizeGearMaterials(availableMaterials);
                if (Object.keys(initialMaterials).length === 0) {
                                initialMaterials = { ...availableMaterials };
                } else {
                                Object.entries(availableMaterials).forEach(([mat, amt]) => {
                                                if (!(mat in initialMaterials)) {
                                                                initialMaterials[mat] = amt;
                                                }
                                });
                }

                let templatesByLevel = {};
                let totalTemplates = 0;
                LEVELS.forEach(level => {
                                const val = parseInt(document.getElementById(`templateAmount${level}`).value.replace(/,/g, '')) || 0;
                                templatesByLevel[level] = val;
                                requestedTemplates[level] = val;
                                totalTemplates += val;
                                const quality = document.getElementById(`temp${level}`).value;
                                qualityMultipliers[level] = getQualityMultiplier(quality);
                });
                if (totalTemplates === 0) {
                                document.querySelector('.spinner-wrap').classList.remove('active');
                                clearCalculationProgress();
                                return;
                } else {
                                if (!isDebugMode){
                                                gtag('event', 'total_material_templates', {
                                                                'event_material_templates': totalTemplates,
                                                                'value': 1
                                                });
                                }
                }

                let materialAmounts = Object.values(availableMaterials).map(amount => {
                        if (typeof amount === 'string' && amount.includes(',')) {
                                return parseInt(amount.replace(/,/g, ''), 10);
                        } else {
                                return parseInt(amount, 10);
                        }
                });

                if (!isDebugMode){
                        let totalMaterialAmount = materialAmounts.reduce((total, amount) => total + amount, 0);
                        let averageMaterialAmount = materialAmounts.length > 0 ? totalMaterialAmount / materialAmounts.length : 0;
                        let maxMaterialAmount = Math.max(...materialAmounts);
                        let maxMaterialIndex = materialAmounts.findIndex(amount => amount === maxMaterialAmount);
                        let maxMaterialName = Object.keys(availableMaterials)[maxMaterialIndex];

                        gtag('event', 'material_analytics', {
                                'average_material_amount': parseInt(averageMaterialAmount),
                                'max_material_amount': maxMaterialAmount,
                                'max_material_name': maxMaterialName,
                                'value': 1
                        });
                }

                const progressTracker = createProgressTracker(totalTemplates);
                const resultPlan = await calculateProductionPlan(availableMaterials, templatesByLevel, progressTracker.tick);
                progressTracker.complete();
                failedLevels = resultPlan.failedLevels;
                pendingFailedLevels = Array.isArray(resultPlan.failedLevels)
                    ? [...resultPlan.failedLevels]
                    : null;
                preserveRequestedTemplates = true;

                document.querySelectorAll('#manualInput input[type="number"]').forEach(input => {
                        input.value = ''; // Nollaa kaikki input-kentät
                });
                listSelectedProducts(resultPlan.plan);
                const calculateBtn = document.querySelector('.calculate-button');
                if (calculateBtn) {
                        calculateBtn.click(); // Simuloi napin klikkausta
                } else {
                        document.querySelector('.spinner-wrap').classList.remove('active');
                        clearCalculationProgress();
                        pendingFailedLevels = null;
                        preserveRequestedTemplates = false;
                }
        } catch (error) {
                console.error('Failed to calculate templates with preferences:', error);
                displayUserMessage('Something went wrong while calculating templates. Please try again.');
                document.querySelector('.spinner-wrap').classList.remove('active');
                clearCalculationProgress();
        }
}

document.getElementById('calculateWithPreferences').addEventListener('click', calculateWithPreferences);

function gatherMaterialsFromInputs() {
    const scaleSelect = document.getElementById('scaleSelect');
    const scale = scaleSelect ? parseFloat(scaleSelect.value) || 1 : 1;
    let materialsInput = {};
    document.querySelectorAll('.my-material input[type="text"]').forEach(input => {
        const id = input.getAttribute('id').replace('my-', '');
        const materialName = materialKeyMap[normalizeKey(id)];
        const raw = input.value.replace(/,/g, '');
        const materialAmount = parseFloat(raw);
        if (!materialName) {
            return;
        }
        if (!isNaN(materialAmount)) {
            materialsInput[materialName] = materialAmount * scale;
        }
    });

    return materialsInput;
}

function sanitizeGearMaterials(materialsInput) {
    const cleaned = { ...materialsInput };
    Object.entries(materialsInput).forEach(([name, amount]) => {
        const season = materialToSeason[name] || 0;
        if (season !== 0 && (!amount || amount <= 0)) {
            delete cleaned[name];
        }
    });
    return cleaned;
}

function filterProductsByAvailableGear(products, availableMaterials, multiplier = 1) {
    const availableMap = getNormalizedKeyMap(availableMaterials);
    return products.filter(product => {
        return Object.entries(product.materials).every(([mat, amt]) => {
            const normalized = normalizeKey(mat);
            const season = materialToSeason[normalized] || materialToSeason[mat] || 0;
            if (season === 0) {
                return true;
            }
            const matchedKey = availableMap[normalized];
            return matchedKey && availableMaterials[matchedKey] >= amt * multiplier;
        });
    });
}

const SEASONAL_ODDS_LEVELS = new Set([15, 20, 25, 30, 35, 40, 45]);
const EXTENDED_ODDS_LEVELS = new Set([20]);

function shouldApplyOddsForProduct(product) {
    if (!product?.odds || product.odds === 'normal') {
        return false;
    }

    const level = product.level;
    const season = product.season;
    const isCeremonialTargaryenWarlord = product.setName === 'Ceremonial Targaryen Warlord';

    if ((season === 0 || isCeremonialTargaryenWarlord) && SEASONAL_ODDS_LEVELS.has(level)) {
        return true;
    }

    if ((season === 1 || season === 2) && EXTENDED_ODDS_LEVELS.has(level)) {
        return true;
    }

    return false;
}

async function calculateProductionPlan(availableMaterials, templatesByLevel, progressTick = async () => {}) {
    const productionPlan = { "1": [], "5": [], "10": [], "15": [], "20": [], "25": [], "30": [], "35": [], "40": [], "45": [] };
    const failed = new Set();
    const levelScoreLog = {};
    const loggedLevelSummary = new Set();
    const producedCounts = LEVELS.reduce((acc, level) => {
        acc[level] = 0;
        return acc;
    }, {});
    const formatScore = (value) => (Number.isInteger(value) ? `${value}` : value.toFixed(2));
    const recordSelection = (level, product, score, quantity = 1, materialBreakdown = []) => {
        if (quantity <= 0) {
            return;
        }
        const safeQuantity = Math.max(1, Math.floor(quantity));
        if (!levelScoreLog[level]) {
            levelScoreLog[level] = [];
        }
        const repeatedScores = new Array(safeQuantity).fill(score);
        levelScoreLog[level].push(...repeatedScores);
        const quantityLabel = safeQuantity > 1 ? ` x${safeQuantity}` : '';
        const formatScoreWithSign = (value) => {
            if (!Number.isFinite(value)) {
                return `${value}`;
            }
            const formatted = formatScore(value);
            if (value > 0 && !formatted.startsWith('+')) {
                return `+${formatted}`;
            }
            return formatted;
        };
        let materialsDetail = '';
        if (Array.isArray(materialBreakdown) && materialBreakdown.length > 0) {
            const parts = materialBreakdown.map(({ name, amount, perUnitScore }) => {
                const formattedAmount = Number.isFinite(amount)
                    ? (Number.isInteger(amount) ? `${amount}` : amount.toFixed(2))
                    : `${amount}`;
                const amountLabel = Number.isFinite(amount) && Math.abs(amount - 1) < 1e-6
                    ? ''
                    : ` x${formattedAmount}`;
                return `${name}${amountLabel} ${formatScoreWithSign(perUnitScore)}`;
            });
            materialsDetail = ` (${parts.join(', ')})`;
        }
        console.log(`Level ${level} - ${product.name}${quantityLabel} - ${formatScore(score)}${materialsDetail}`);
    };
    const logLevelSummary = (level) => {
        if (loggedLevelSummary.has(level)) {
            return;
        }
        const scores = levelScoreLog[level];
        if (!scores || scores.length === 0) {
            return;
        }
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        console.log(`Korkein valittu pistemäärä: ${formatScore(maxScore)} (Level ${level})`);
        console.log(`Alin valittu pistemäärä: ${formatScore(minScore)} (Level ${level})`);
        loggedLevelSummary.add(level);
    };
    const includeWarlords = document.getElementById('includeWarlords')?.checked ?? true;
    const level1OnlyWarlords = document.getElementById('level1OnlyWarlords')?.checked ?? false;
    const level20OnlyWarlords = document.getElementById('level20OnlyWarlords')?.checked ?? false;
    const includeLowOdds = document.getElementById('includeLowOdds')?.checked ?? true;
    const includeMediumOdds = document.getElementById('includeMediumOdds')?.checked ?? true;
    const seasonZeroPreference = getSeasonZeroPreference();
    const gearLevelSelect = document.getElementById('gearMaterialLevels');
    const allowedGearLevels = gearLevelSelect ? Array.from(gearLevelSelect.selectedOptions).map(o => parseInt(o.value, 10)) : [];
    const hasGearMaterials = Object.keys(availableMaterials).some(
        key => (materialToSeason[key] || materialToSeason[normalizeKey(key)] || 0) !== 0
    );
    const level20Allowed = hasGearMaterials && allowedGearLevels.includes(20);
    level20OnlyWarlordsActive = level20OnlyWarlords;
    ctwMediumNotice = includeWarlords && !includeMediumOdds && !level20Allowed && !level20OnlyWarlords;
    const progress = typeof progressTick === 'function' ? progressTick : async () => {};

    const getLevelProducts = (level, { requireCtwOnly = false } = {}) => {
        const baseList = productsByLevel[level] ? [...productsByLevel[level]] : [];
        if (requireCtwOnly) {
            return baseList.filter(p => p.warlord && p.setName === 'Ceremonial Targaryen Warlord');
        }
        if (level === 1 && level1OnlyWarlords) {
            return baseList.filter(p => p.warlord);
        }
        if (includeWarlords) {
            return baseList.slice();
        }
        return baseList.filter(p => !p.warlord);
    };

    const applyLevelFilters = (level, levelProducts, multiplier, { requireCtwOnly = false } = {}) => {
        let filtered = levelProducts;
        if (!allowedGearLevels.includes(level)) {
            filtered = filtered.filter(p => p.season == 0 || p.setName === ctwSetName);
        }
        const isLegendary = multiplier >= 1024;
        filtered = filtered.filter(p => {
            if (requireCtwOnly && p.setName === 'Ceremonial Targaryen Warlord') {
                return true;
            }
            const applyOdds = !isLegendary && shouldApplyOddsForProduct(p);
            if (!applyOdds) return true;
            if (p.odds === 'low') return includeLowOdds;
            if (p.odds === 'medium') return includeMediumOdds || (ctwMediumNotice && p.warlord && p.level === 20);
            return true;
        });
        filtered = filterProductsByAvailableGear(filtered, availableMaterials, multiplier);
        filtered = applySeasonZeroPreference(filtered, seasonZeroPreference);
        return filtered;
    };

    const appendPlanEntry = (level, product, quantity = 1, materialBreakdown = []) => {
        if (quantity <= 0) {
            return;
        }
        const safeQuantity = Math.max(1, Math.floor(quantity));
        if (!Number.isFinite(safeQuantity)) {
            return;
        }
        const levelEntries = productionPlan[level];
        const lastEntry = levelEntries[levelEntries.length - 1];
        if (
            lastEntry &&
            lastEntry.name === product.name &&
            lastEntry.season === product.season &&
            lastEntry.setName === product.setName &&
            lastEntry.warlord === product.warlord
        ) {
            lastEntry.quantity = (lastEntry.quantity || 1) + safeQuantity;
            if (!Array.isArray(lastEntry.materials) || lastEntry.materials.length === 0) {
                lastEntry.materials = Array.isArray(materialBreakdown)
                    ? materialBreakdown.map(entry => ({ ...entry }))
                    : [];
            }
        } else {
            levelEntries.push({
                name: product.name,
                season: product.season,
                setName: product.setName,
                warlord: product.warlord,
                quantity: safeQuantity,
                materials: Array.isArray(materialBreakdown)
                    ? materialBreakdown.map(entry => ({ ...entry }))
                    : []
            });
        }
        producedCounts[level] = (producedCounts[level] || 0) + safeQuantity;
    };

    const processNormalOddsLevel = async (level) => {
        if (
            templatesByLevel[level] > 0 &&
            !includeLowOdds &&
            !includeMediumOdds &&
            seasonZeroPreference !== SeasonZeroPreference.OFF
        ) {
            let remaining = templatesByLevel[level];
            const multiplier = qualityMultipliers[level] || 1;
            let produced = 0;

            while (remaining > 0) {
                const prefs = getUserPreferences(availableMaterials);
                let levelProducts = getLevelProducts(level);
                levelProducts = applyLevelFilters(level, levelProducts, multiplier);
                if (levelProducts.length === 0) {
                    break;
                }
                const levelAllowsGear = allowedGearLevels.includes(level);
                const selected = selectBestAvailableProduct(
                    level,
                    levelProducts,
                    prefs,
                    availableMaterials,
                    multiplier,
                    { levelAllowsGear, seasonZeroPreference }
                );

                if (selected && canProductBeProduced(selected, availableMaterials, multiplier)) {
                    const maxCraftable = getMaxCraftableQuantity(selected, availableMaterials, multiplier);
                    const canFastTrack = shouldFastTrackLevel(level, levelProducts, selected, {
                        allowedGearLevels,
                        multiplier
                    });
                    const chunkSize = determineChunkSize(level, remaining, maxCraftable, { fastTrack: canFastTrack });

                    if (chunkSize <= 0) {
                        break;
                    }

                    const materialBreakdown = [];
                    const score = getMaterialScore(
                        selected,
                        prefs,
                        availableMaterials,
                        multiplier,
                        level,
                        { levelAllowsGear, seasonZeroPreference },
                        materialBreakdown
                    );
                    const quantity = Math.max(1, Math.floor(chunkSize));
                    recordSelection(level, selected, score, quantity, materialBreakdown);
                    appendPlanEntry(level, selected, quantity, materialBreakdown);
                    updateAvailableMaterials(availableMaterials, selected, multiplier, quantity);
                    remaining -= quantity;
                    if (remaining < 0) {
                        remaining = 0;
                    }
                    produced += quantity;
                    await progress(quantity);
                } else {
                    break;
                }
            }

            templatesByLevel[level] = remaining;

            if (produced > 0) {
                if (remaining <= 0) {
                    templatesByLevel[level] = 0;
                    logLevelSummary(level);
                }
                return;
            }
        }
    };

    const normalOddsPriorityLevels = [35, 30, 15];
    for (const level of normalOddsPriorityLevels) {
        await processNormalOddsLevel(level);
    }

    for (const level of LEVELS) {
        if (templatesByLevel[level] <= 0) continue;
        const requireCtwOnly = level === 20 && level20OnlyWarlords;
        let levelProducts = getLevelProducts(level, { requireCtwOnly });
        const multiplier = qualityMultipliers[level] || 1;
        levelProducts = applyLevelFilters(level, levelProducts, multiplier, { requireCtwOnly });
        if (levelProducts.length === 0) {
            failed.add(level);
            templatesByLevel[level] = 0;
        }
    }

    let remaining = { ...templatesByLevel };

    while (Object.values(remaining).some(v => v > 0)) {
        const preferenceInfo = getUserPreferences(availableMaterials);
        let anySelected = false;

        for (const level of LEVELS) {
            if (remaining[level] <= 0) continue;
            const requireCtwOnly = level === 20 && level20OnlyWarlords;
            let levelProducts = getLevelProducts(level, { requireCtwOnly });
            const multiplier = qualityMultipliers[level] || 1;
            levelProducts = applyLevelFilters(level, levelProducts, multiplier, { requireCtwOnly });

            const levelAllowsGear = allowedGearLevels.includes(level);

            if (
                level === 40 &&
                remaining[45] > 0 &&
                producedCounts[45] <= producedCounts[40]
            ) {
                continue;
            }

            const selectedProduct = selectBestAvailableProduct(
                level,
                levelProducts,
                preferenceInfo,
                availableMaterials,
                multiplier,
                { levelAllowsGear, seasonZeroPreference }
            );

            if (selectedProduct && canProductBeProduced(selectedProduct, availableMaterials, multiplier)) {
                const maxCraftable = getMaxCraftableQuantity(selectedProduct, availableMaterials, multiplier);
                const canFastTrack = shouldFastTrackLevel(level, levelProducts, selectedProduct, {
                    allowedGearLevels,
                    multiplier
                });
                const chunkSize = determineChunkSize(level, remaining[level], maxCraftable, { fastTrack: canFastTrack });

                if (chunkSize <= 0) {
                    failed.add(level);
                    remaining[level] = 0;
                    continue;
                }

                const materialBreakdown = [];
                const score = getMaterialScore(
                    selectedProduct,
                    preferenceInfo,
                    availableMaterials,
                    multiplier,
                    level,
                    { levelAllowsGear, seasonZeroPreference },
                    materialBreakdown
                );
                const quantity = Math.max(1, Math.floor(chunkSize));
                recordSelection(level, selectedProduct, score, quantity, materialBreakdown);
                appendPlanEntry(level, selectedProduct, quantity, materialBreakdown);
                updateAvailableMaterials(availableMaterials, selectedProduct, multiplier, quantity);
                remaining[level] -= quantity;
                if (remaining[level] <= 0) {
                    remaining[level] = 0;
                    logLevelSummary(level);
                }
                anySelected = true;
                await progress(quantity);
            } else {
                failed.add(level);
                remaining[level] = 0;
            }
        }

        if (!anySelected) {
            break;
        }
    }

    LEVELS.forEach(level => {
        if (remaining[level] === 0) {
            logLevelSummary(level);
        }
    });

    return { plan: productionPlan, failedLevels: Array.from(failed) };
}

function displayUserMessage(message) {
    const resultsDiv = document.getElementById('results');
    const messageElement = document.createElement('h3');
    messageElement.innerHTML = message;
    const generateDiv = resultsDiv.querySelector('.generate');

    // Lisää viesti ennen generateDiviä
    resultsDiv.insertBefore(messageElement, generateDiv);
}




function updateAvailableMaterials(availableMaterials, selectedProduct, multiplier = 1, quantity = 1) {
    const availableMap = getNormalizedKeyMap(availableMaterials);
    Object.entries(selectedProduct.materials).forEach(([material, amountRequired]) => {
        const normalizedMaterial = normalizeKey(material);
        const matchedKey = availableMap[normalizedMaterial];

        if (matchedKey) {
            const totalRequired = amountRequired * multiplier * quantity;
            availableMaterials[matchedKey] -= totalRequired;
        }
    });
}







function getUserPreferences(availableMaterials) {
    const sortedMaterials = Object.entries(availableMaterials)
        .map(([material, amount]) => [material, Number(amount) || 0])
        .sort((a, b) => b[1] - a[1]);

    const rankByMaterial = {};
    const normalizedLeastMaterials = new Set();
    const balancePenalties = calculateMaterialBalancePenalties(sortedMaterials);

    let currentRank = 1;
    let index = 0;

    while (index < sortedMaterials.length) {
        const groupAmount = sortedMaterials[index][1];
        let groupEnd = index + 1;
        while (groupEnd < sortedMaterials.length && sortedMaterials[groupEnd][1] === groupAmount) {
            groupEnd++;
        }

        for (let i = index; i < groupEnd; i++) {
            const [materialName] = sortedMaterials[i];
            rankByMaterial[normalizeKey(materialName)] = currentRank;
        }

        currentRank += groupEnd - index;
        index = groupEnd;
    }

    if (sortedMaterials.length > 0) {
        const leastAmount = sortedMaterials[sortedMaterials.length - 1][1];
        sortedMaterials.forEach(([materialName, amount]) => {
            if (amount === leastAmount) {
                normalizedLeastMaterials.add(normalizeKey(materialName));
            }
        });
    }

    const preferenceDetails = {
        rankByMaterial,
        leastMaterials: normalizedLeastMaterials,
        sortedMaterials,
        balancePenalties
    };

    logMaterialPreferenceDetails(
        preferenceDetails.sortedMaterials,
        preferenceDetails.rankByMaterial,
        preferenceDetails.leastMaterials,
        preferenceDetails.balancePenalties
    );

    return preferenceDetails;
}

function logMaterialPreferenceDetails(sortedMaterials, rankByMaterial, leastMaterials, balancePenalties) {
    if (!Array.isArray(sortedMaterials)) {
        return;
    }

    const formatAmount = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return `${value}`;
        }
        return Number.isInteger(numeric) ? `${numeric}` : numeric.toFixed(2);
    };

    const formatScoreWithSign = (value) => {
        if (!Number.isFinite(value)) {
            return `${value}`;
        }
        const isInteger = Number.isInteger(value);
        const formatted = isInteger ? `${value}` : value.toFixed(2);
        if (value > 0 && !formatted.startsWith('+')) {
            return `+${formatted}`;
        }
        return formatted;
    };

    if (sortedMaterials.length === 0) {
        console.log('Materiaali tasot päivitetty: ei materiaaleja saatavilla.');
        return;
    }

    console.log('Materiaali tasot päivitetty:');
    sortedMaterials.forEach(([materialName, rawAmount]) => {
        const normalized = normalizeKey(materialName);
        const rank = rankByMaterial ? rankByMaterial[normalized] : undefined;
        const isLeast = leastMaterials ? leastMaterials.has(normalized) : false;
        let materialScore = getRankScore(rank, isLeast);
        if (balancePenalties && Object.prototype.hasOwnProperty.call(balancePenalties, normalized)) {
            materialScore += balancePenalties[normalized];
        }
        console.log(` - ${materialName}: ${formatAmount(rawAmount)} (${formatScoreWithSign(materialScore)})`);
    });
}

function calculateMaterialBalancePenalties(sortedMaterials) {
    if (!Array.isArray(sortedMaterials) || sortedMaterials.length < 2) {
        return {};
    }

    const entries = sortedMaterials.map(([material, rawAmount]) => {
        const normalized = normalizeKey(material);
        const season = materialToSeason[normalized] || materialToSeason[material] || 0;

        return {
            normalized,
            amount: Number(rawAmount) || 0,
            season
        };
    });

    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (total <= 0) {
        return {};
    }

    const mean = total / entries.length;
    const maxAmount = Math.max(...entries.map(entry => entry.amount));
    if (!Number.isFinite(mean) || mean <= 0 || !Number.isFinite(maxAmount) || maxAmount <= 0) {
        return {};
    }

    const penalties = {};

    entries.forEach(entry => {
        const ratioToMean = entry.amount / mean;
        const ratioToMax = entry.amount / maxAmount;

        let penalty = 0;

        if (ratioToMean < 0.25 || ratioToMax < 0.15) {
            penalty = -18;
        } else if (ratioToMean < 0.5 || ratioToMax < 0.3) {
            penalty = -12;
        } else if (ratioToMean < 0.75 || ratioToMax < 0.5) {
            penalty = -6;
        }

        if (entry.amount === 0) {
            penalty = Math.min(penalty - 6, -22);
        }

        if (entry.season === 0 && penalty < 0) {
            penalty = Math.min(penalty * 1.1, -22);
        }

        if (penalty !== 0) {
            penalties[entry.normalized] = penalty;
        }
    });

    return penalties;
}

function getRankScore(rank, isLeastMaterial) {
    if (isLeastMaterial) {
        return -25;
    }

    if (!Number.isFinite(rank)) {
        return DEFAULT_RANK_PENALTY;
    }

    if (Object.prototype.hasOwnProperty.call(MATERIAL_RANK_POINTS, rank)) {
        return MATERIAL_RANK_POINTS[rank];
    }

    if (MATERIAL_NEUTRAL_RANKS.has(rank)) {
        return 0;
    }

    if (rank > MAX_DEFINED_MATERIAL_RANK) {
        return MATERIAL_RANK_POINTS[MAX_DEFINED_MATERIAL_RANK] || DEFAULT_RANK_PENALTY;
    }

    return DEFAULT_RANK_PENALTY;
}

function selectBestAvailableProduct(
    level,
    levelProducts,
    preferenceInfo,
    availableMaterials,
    multiplier = 1,
    { levelAllowsGear = false, seasonZeroPreference = SeasonZeroPreference.NORMAL } = {}
) {
    const candidates = levelProducts
        .map(product => ({
            product,
            score: getMaterialScore(
                product,
                preferenceInfo,
                availableMaterials,
                multiplier,
                level,
                { levelAllowsGear, seasonZeroPreference }
            )
        }))
        .sort((a, b) => b.score - a.score);

    for (const { product } of candidates) {
        if (canProductBeProduced(product, availableMaterials, multiplier)) {
            return product;
        }
    }

    return null;
}

function rollbackMaterials(availableMaterials, product, multiplier = 1) {
    const availableMap = getNormalizedKeyMap(availableMaterials);
    Object.entries(product.materials).forEach(([material, amountRequired]) => {
        const normalizedMaterial = normalizeKey(material);
        const matchedKey = availableMap[normalizedMaterial];

        if (matchedKey) {
            availableMaterials[matchedKey] += amountRequired * multiplier;
        }
    });
}

function getMaterialScore(
    product,
    preferenceInfo,
    availableMaterials,
    multiplier = 1,
    level,
    { levelAllowsGear = false, seasonZeroPreference = SeasonZeroPreference.NORMAL } = {},
    breakdownCollector = null
) {
    if (!product || !product.materials) {
        return INSUFFICIENT_MATERIAL_PENALTY;
    }

    const availableMap = getNormalizedKeyMap(availableMaterials);
    const { rankByMaterial, leastMaterials } = preferenceInfo || {};
    let totalPoints = 0;
    let totalRequiredUnits = 0;

    for (const [material, amountRequired] of Object.entries(product.materials)) {
        const normalizedMaterial = normalizeKey(material);
        const matchedKey = availableMap[normalizedMaterial];
        const normalizedMatchedKey = normalizeKey(matchedKey || material);

        if (!matchedKey) {
            return INSUFFICIENT_MATERIAL_PENALTY;
        }

        const availableAmount = Number(availableMaterials[matchedKey]) || 0;
        const totalRequired = Number(amountRequired) * multiplier;
        if (availableAmount < totalRequired) {
            return INSUFFICIENT_MATERIAL_PENALTY;
        }

        const rank = rankByMaterial ? rankByMaterial[normalizedMatchedKey] : undefined;
        const isLeastMaterial = leastMaterials ? leastMaterials.has(normalizedMatchedKey) : false;
        let materialScore = getRankScore(rank, isLeastMaterial);
        const balancePenalty =
            preferenceInfo && preferenceInfo.balancePenalties
                ? preferenceInfo.balancePenalties[normalizedMatchedKey] || 0
                : 0;
        materialScore += balancePenalty;

        const season = materialToSeason[normalizedMaterial] || materialToSeason[normalizedMatchedKey] || 0;
        const isGearMaterial = levelAllowsGear && season !== 0;
        if (isGearMaterial) {
            materialScore = GEAR_MATERIAL_SCORE;
        }

        if (Array.isArray(breakdownCollector)) {
            const displayName = isGearMaterial
                ? 'gear mat'
                : materialKeyMap[normalizedMatchedKey] || matchedKey || material;
            breakdownCollector.push({
                name: displayName,
                normalized: normalizedMatchedKey,
                amount: totalRequired,
                perUnitScore: materialScore,
                totalScore: materialScore * totalRequired,
                season,
                isGearMaterial
            });
        }

        totalPoints += materialScore * totalRequired;
        totalRequiredUnits += totalRequired;
    }

    if (totalRequiredUnits === 0) {
        return INSUFFICIENT_MATERIAL_PENALTY;
    }

    let score = totalPoints / totalRequiredUnits;

    if (product.setName === ctwSetName && CTW_LOW_LEVELS.has(level)) {
        score -= 4;
    }

    if (product.season === 0) {
        if (seasonZeroPreference === SeasonZeroPreference.HIGH) {
            score += SEASON_ZERO_HIGH_BONUS;
        } else if (seasonZeroPreference === SeasonZeroPreference.LOW) {
            score += SEASON_ZERO_LOW_BONUS;
        }
    }

    return score;
}

function canProductBeProduced(product, availableMaterials, multiplier = 1) {
    const availableMap = getNormalizedKeyMap(availableMaterials);
    return Object.entries(product.materials).every(([material, amountRequired]) => {
        const normalizedMaterial = normalizeKey(material);
        const matchedKey = availableMap[normalizedMaterial];

        if (!matchedKey) {
            return false;
        }

        return availableMaterials[matchedKey] >= amountRequired * multiplier;
    });
}

function getMaxCraftableQuantity(product, availableMaterials, multiplier = 1) {
    if (!product || !product.materials) {
        return 0;
    }
    const availableMap = getNormalizedKeyMap(availableMaterials);
    let maxCraftable = Infinity;

    for (const [material, amountRequired] of Object.entries(product.materials)) {
        const normalizedMaterial = normalizeKey(material);
        const matchedKey = availableMap[normalizedMaterial];

        if (!matchedKey) {
            return 0;
        }

        const totalRequired = amountRequired * multiplier;
        if (totalRequired <= 0) {
            continue;
        }

        const available = Number(availableMaterials[matchedKey]) || 0;
        const craftableWithMaterial = Math.max(0, Math.floor(available / totalRequired));
        maxCraftable = Math.min(maxCraftable, craftableWithMaterial);

        if (maxCraftable === 0) {
            return 0;
        }
    }

    return Number.isFinite(maxCraftable) ? maxCraftable : 0;
}

function usesOnlyBaseMaterials(product) {
    if (!product || !product.materials) {
        return false;
    }
    return Object.keys(product.materials).every(material => {
        const normalized = normalizeKey(material);
        const season = materialToSeason[normalized] || materialToSeason[material] || 0;
        return season === 0;
    });
}

function shouldFastTrackLevel(level, levelProducts, selectedProduct, { allowedGearLevels = [] } = {}) {
    if (!selectedProduct || !Array.isArray(levelProducts)) {
        return false;
    }

    if (!(level === 30 || level === 35)) {
        return false;
    }

    if (allowedGearLevels.includes(level)) {
        return false;
    }

    if (levelProducts.length !== 1) {
        return false;
    }

    if (selectedProduct.season !== 0) {
        return false;
    }

    if (selectedProduct.odds && selectedProduct.odds !== 'normal') {
        return false;
    }

    return usesOnlyBaseMaterials(selectedProduct);
}

function determineChunkSize(level, requested, maxCraftable, { fastTrack = false } = {}) {
    const needed = Math.max(0, Math.floor(requested));
    const available = Math.max(0, Math.floor(maxCraftable));

    if (needed === 0 || available === 0) {
        return 0;
    }

    if (fastTrack) {
        return Math.min(needed, available);
    }

    if (level === 45) {
        return Math.min(1, needed, available);
    }

    const defaultThresholds = [
        { min: 5000, size: 500 },
        { min: 3000, size: 300 },
        { min: 2000, size: 200 },
        { min: 1500, size: 150 },
        { min: 1000, size: 100 },
        { min: 600, size: 60 },
        { min: 400, size: 30 },
        { min: 200, size: 15 },
        { min: 100, size: 5 },
        { min: 50, size: 3 },
        { min: 20, size: 1 }
    ];

    const midLevelThresholds = [
        { min: 2000, size: 80 },
        { min: 1500, size: 60 },
        { min: 1000, size: 40 },
        { min: 600, size: 20 },
        { min: 200, size: 10 },
        { min: 100, size: 5 },
        { min: 50, size: 3 },
        { min: 20, size: 2 }
    ];

    const highLevelThresholds = [
        { min: 200, size: 5 },
        { min: 120, size: 3 },
        { min: 60, size: 2 }
    ];

    let thresholds = defaultThresholds;
    if ([20, 25, 30].includes(level)) {
        thresholds = midLevelThresholds;
    } else if ([35, 40].includes(level)) {
        thresholds = highLevelThresholds;
    }

    for (const { min, size } of thresholds) {
        if (needed >= min) {
            const chunk = Math.min(size, needed, available);
            if (chunk > 0) {
                return chunk;
            }
        }
    }

    return Math.min(needed, available, thresholds.length > 0 ? thresholds[thresholds.length - 1].size : needed);
}





function listSelectedProducts(productionPlan) {
    Object.entries(productionPlan).forEach(([level, products]) => {
        products.forEach(({ name, season, setName, quantity = 1 }) => {
            const selector = `#level-${level}-items input[name="${slug(name)}_${season}_${slug(setName || 'no-set')}"]`;
            const inputElement = document.querySelector(selector);
            if (inputElement) {
                const currentValue = parseInt(inputElement.value, 10) || 0;
                inputElement.value = currentValue + quantity;
            }
        });
    });
}


function inputActive(){

	document.addEventListener('click', (e) => {
        const clickedDiv = e.target.closest('.my-material');
        if (clickedDiv && !e.target.closest('.level-checkboxes')) {
            document.querySelectorAll('.my-material').forEach(div => {
                const inp = div.querySelector('.numeric-input');
                if (div !== clickedDiv && inp && inp.value === '') {
                    div.classList.remove('active');
                }
            });
            clickedDiv.classList.add('active');
            const input = clickedDiv.querySelector('.numeric-input');
            if (input) input.focus();
        }
    });

	document.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('numeric-input')) {
            if (e.target.value === '') {
                const parent = e.target.closest('.my-material');
                if (parent) parent.classList.remove('active');
            }
        }
    }, true);
	
	document.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('numeric-input')) {
            document.querySelectorAll('.my-material').forEach(div => {
                const inp = div.querySelector('.numeric-input');
                if (inp && inp.value === '' && div !== e.target.closest('.my-material')) {
                    div.classList.remove('active');
                }
            });
            e.target.closest('.my-material').classList.add('active');
        }
    });		

	// Uusi osa: käsittele kaikki templateAmount-inputit tasoittain (1,5,10,...)
        const levels = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45];
	levels.forEach(level => {
		const input = document.querySelector(`#templateAmount${level}`);
		const wrap = document.querySelector(`.leveltmp${level} .templateAmountWrap`);

		if (input && wrap) {
			input.addEventListener('focus', () => {
				wrap.classList.add('active');
			});

			input.addEventListener('blur', () => {
				if (!input.value) {
					wrap.classList.remove('active');
				}
			});
		}
	});
}

function initAdvMaterialSection() {
    const toggle = document.getElementById('toggleAdvMaterials');
    const container = document.getElementById('advMaterials');
    if (!toggle || !container || typeof seasons === 'undefined') return;

    toggle.addEventListener('click', () => {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        toggle.classList.toggle('open', isHidden);
    });

    const seasonData = seasons.filter(s => s.season !== 0).sort((a, b) => b.season - a.season);

    const arrowSvg = '<svg class="toggle-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>';

    seasonData.forEach(season => {
        const header = document.createElement('h4');
        header.innerHTML = `Season ${season.season}${arrowSvg}`;
        container.appendChild(header);

        const seasonDiv = document.createElement('div');
        seasonDiv.style.display = 'none';
        container.appendChild(seasonDiv);

        header.addEventListener('click', () => {
            const isHidden = seasonDiv.style.display === 'none';
            seasonDiv.style.display = isHidden ? 'block' : 'none';
            header.classList.toggle('open', isHidden);
        });

        season.sets.forEach(set => {
            const matKey = set.setMat
                .toLowerCase()
                .replace(/'s/g, '')
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
            const matInfo = materials[season.season] && materials[season.season].mats[matKey];
            if (!matInfo) return;

            const matDiv = document.createElement('div');
            matDiv.className = `my-material ${matKey}`;

            const img = document.createElement('img');
            img.src = matInfo.img;
            matDiv.appendChild(img);

            const inner = document.createElement('div');
            const span = document.createElement('span');
            span.textContent = matInfo["Original-name"] || set.setMat;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'numeric-input';
            input.id = `my-${matKey}`;
            input.name = `my-${matKey}`;
            input.placeholder = 'value';
            input.pattern = '[0-9]*';
            input.inputMode = 'numeric';
            inner.appendChild(span);
            inner.appendChild(input);
            matDiv.appendChild(inner);

            seasonDiv.appendChild(matDiv);
        });
    });

    const infoHeader = document.createElement('div');
    infoHeader.className = 'section-title';
    const infoInner = document.createElement('div');
    infoInner.className = 'checkbox-header';
    const infoSpan = document.createElement('span');
    infoSpan.textContent = 'Gear materials at levels';
    const infoBtn = document.createElement('button');
    infoBtn.id = 'gearLevelsInfoBtn';
    infoBtn.className = 'info-btn';
    infoBtn.setAttribute('aria-label', 'Gear materials info');
    infoBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336c-13.3 0-24 10.7-24 24s10.7 24 24 24l80 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-8 0 0-88c0-13.3-10.7-24-24-24l-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l24 0 0 64-24 0zm40-144a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/></svg>';
    infoInner.appendChild(infoSpan);
    infoInner.appendChild(infoBtn);
    infoHeader.appendChild(infoInner);
    container.appendChild(infoHeader);

    const infoPopup = document.createElement('div');
    infoPopup.id = 'gearLevelsInfoPopup';
    infoPopup.className = 'info-overlay';
    infoPopup.innerHTML = '<div class="info-content"><button class="close-popup" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"></path></svg></button><p>Select the levels where gear set materials may be used. Other levels craft only with basic materials, allowing you to save gear materials for later levels. Levels with a dark background are active.</p></div>';
    container.appendChild(infoPopup);

    const levelWrap = document.createElement('div');
    levelWrap.className = 'level-select-container';

    const dropdown = document.createElement('div');
    dropdown.className = 'level-dropdown';
    const select = document.createElement('select');
    select.id = 'gearMaterialLevels';
    select.multiple = true;
    select.style.display = 'none';

    const defaultGearLevels = [20, 25, 30, 35, 40, 45];
    [5,10,15,20,25,30,35,40,45].forEach(l => {
        const optionDiv = document.createElement('div');
        optionDiv.dataset.value = l;
        optionDiv.textContent = l;
        if (defaultGearLevels.includes(l)) {
            optionDiv.classList.add('selected');
        }
        dropdown.appendChild(optionDiv);

        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = l;
        if (defaultGearLevels.includes(l)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    dropdown.addEventListener('click', e => {
        const value = e.target.dataset.value;
        if (!value) return;
        e.target.classList.toggle('selected');
        Array.from(select.options).forEach(opt => {
            if (opt.value === value) {
                opt.selected = !opt.selected;
            }
        });
    });

    levelWrap.appendChild(dropdown);
    levelWrap.appendChild(select);
    container.appendChild(levelWrap);

    const seasonZeroSection = document.querySelector('.season-zero-section');
    if (seasonZeroSection) {
        container.appendChild(seasonZeroSection);
    }
}

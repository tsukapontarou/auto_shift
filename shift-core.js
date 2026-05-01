(function () {
  const DEFAULT_DAYS = ["月", "火", "水", "木", "金", "土", "日"];
  const PREFERENCE_STATES = ["blocked", "available", "preferred"];
  const PREFERENCE_STATE_META = {
    blocked: { label: "不可", className: "state-blocked" },
    available: { label: "可", className: "state-available" },
    preferred: { label: "希望", className: "state-preferred" }
  };

  function cloneData(value) {
    if (typeof value === "undefined") {
      return null;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function createEditableData(sourceData) {
    const clonedData = cloneData(sourceData);
    const source = clonedData && typeof clonedData === "object" && !Array.isArray(clonedData) ? clonedData : {};
    const days = normalizeDays(source.days);
    const scheduleConfig = resolveScheduleConfig(source);
    const requirementValidation = normalizeRequirements(source.requirements, days, scheduleConfig.slots);
    const staffMembers = normalizeStaffMembers(source.staff, days);

    const data = {
      days: days,
      timeBoundaries: createBoundariesFromConfig(source, scheduleConfig),
      slots: scheduleConfig.slots,
      slotDefinitions: scheduleConfig.slotDefinitions,
      staff: staffMembers,
      requirements: requirementValidation.matrix,
      requirementErrors: requirementValidation.errors,
      configurationErrors: scheduleConfig.errors.concat(requirementValidation.messages)
    };

    ensureStaffSlotState(data.staff, data.days, data.slots, data.slotDefinitions);
    return data;
  }

  function serializeAppData(sourceData) {
    const data = createEditableData(sourceData);

    return {
      days: data.days.slice(),
      timeBoundaries: data.timeBoundaries.slice(),
      staff: data.staff.map(function (staff) {
        return {
          id: staff.id,
          name: staff.name,
          minShifts: staff.minShifts,
          maxShifts: staff.maxShifts,
          timeRanges: cloneData(staff.timeRanges) || {},
          availability: cloneData(staff.availability) || {},
          preferences: cloneData(staff.preferences) || []
        };
      }),
      requirements: cloneNumericRequirementMatrix(data.requirements, data.days, data.slots)
    };
  }

  function normalizeDays(days) {
    if (!Array.isArray(days)) {
      return DEFAULT_DAYS.slice();
    }

    const normalized = days
      .map(function (day) {
        return String(day || "").trim();
      })
      .filter(function (day) {
        return day !== "";
      });

    return normalized.length > 0 ? normalized : DEFAULT_DAYS.slice();
  }

  function normalizeStaffMembers(staffMembers, days) {
    if (!Array.isArray(staffMembers)) {
      return [];
    }

    return staffMembers.map(function (staff, index) {
      const source = staff && typeof staff === "object" ? staff : {};
      const minShifts = normalizeNonNegativeInteger(source.minShifts, 0);
      const maxShifts = normalizeNonNegativeInteger(source.maxShifts, Math.max(minShifts, 0));

      return {
        id: String(source.id || "staff-" + (index + 1)),
        name: String(source.name || "スタッフ" + (index + 1)),
        minShifts: minShifts,
        maxShifts: Math.max(minShifts, maxShifts),
        timeRanges: normalizeTimeRanges(source.timeRanges, days),
        availability: cloneData(source.availability),
        preferences: Array.isArray(source.preferences) ? cloneData(source.preferences) || [] : null
      };
    });
  }

  function normalizeNonNegativeInteger(value, fallback) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 0) {
      return fallback;
    }

    return numericValue;
  }

  function resolveScheduleConfig(sourceData) {
    const boundaryResult = buildScheduleConfigFromBoundaries(sourceData.timeBoundaries);

    if (boundaryResult.ok) {
      return boundaryResult;
    }

    const legacyResult = buildScheduleConfigFromLegacy(sourceData.slots, sourceData.slotDefinitions);

    if (legacyResult.ok) {
      return {
        ok: true,
        slots: legacyResult.slots,
        slotDefinitions: legacyResult.slotDefinitions,
        errors: sourceData.timeBoundaries ? boundaryResult.errors : []
      };
    }

    return {
      ok: false,
      slots: [],
      slotDefinitions: {},
      errors: boundaryResult.errors.concat(legacyResult.errors)
    };
  }

  function createBoundariesFromConfig(sourceData, scheduleConfig) {
    if (Array.isArray(sourceData.timeBoundaries)) {
      return sourceData.timeBoundaries.slice();
    }

    if (scheduleConfig.ok) {
      return createBoundariesFromSlotDefinitions(scheduleConfig.slots, scheduleConfig.slotDefinitions);
    }

    return ["09:00", "20:00"];
  }

  function buildScheduleConfigFromBoundaries(timeBoundaries) {
    if (!Array.isArray(timeBoundaries) || timeBoundaries.length === 0) {
      return {
        ok: false,
        slots: [],
        slotDefinitions: {},
        errors: []
      };
    }

    if (timeBoundaries.length < 2) {
      return {
        ok: false,
        slots: [],
        slotDefinitions: {},
        errors: ["timeBoundaries は開始と終了を含む2件以上が必要です。"]
      };
    }

    const minuteValues = [];

    for (let index = 0; index < timeBoundaries.length; index += 1) {
      const timeText = timeBoundaries[index];
      const minutes = parseTimeToMinutes(timeText);

      if (minutes === null) {
        return {
          ok: false,
          slots: [],
          slotDefinitions: {},
          errors: ["timeBoundaries に不正な時刻 `" + timeText + "` があります。"]
        };
      }

      if (!isThirtyMinuteStep(minutes)) {
        return {
          ok: false,
          slots: [],
          slotDefinitions: {},
          errors: ["timeBoundaries は30分刻みで定義してください。"]
        };
      }

      if (index > 0 && minutes <= minuteValues[index - 1]) {
        return {
          ok: false,
          slots: [],
          slotDefinitions: {},
          errors: ["timeBoundaries は昇順で重複なく定義してください。"]
        };
      }

      minuteValues.push(minutes);
    }

    const slots = [];
    const slotDefinitions = {};

    for (let index = 0; index < timeBoundaries.length - 1; index += 1) {
      const start = timeBoundaries[index];
      const end = timeBoundaries[index + 1];
      const slotName = start + "-" + end;

      slots.push(slotName);
      slotDefinitions[slotName] = {
        start: start,
        end: end
      };
    }

    return {
      ok: true,
      slots: slots,
      slotDefinitions: slotDefinitions,
      errors: []
    };
  }

  function buildScheduleConfigFromLegacy(slots, slotDefinitions) {
    if (!Array.isArray(slots) || slots.length === 0) {
      return {
        ok: false,
        slots: [],
        slotDefinitions: {},
        errors: ["利用できる固定シフト定義がありません。"]
      };
    }

    if (!slotDefinitions || typeof slotDefinitions !== "object") {
      return {
        ok: false,
        slots: [],
        slotDefinitions: {},
        errors: ["slotDefinitions が定義されていません。"]
      };
    }

    const errors = [];

    slots.forEach(function (slot) {
      const definition = slotDefinitions[slot];

      if (!definition) {
        errors.push("slotDefinitions に `" + slot + "` の定義がありません。");
        return;
      }

      const startMinutes = parseTimeToMinutes(definition.start);
      const endMinutes = parseTimeToMinutes(definition.end);

      if (startMinutes === null || endMinutes === null) {
        errors.push("slotDefinitions の `" + slot + "` に不正な時刻があります。");
        return;
      }

      if (!isThirtyMinuteStep(startMinutes) || !isThirtyMinuteStep(endMinutes)) {
        errors.push("slotDefinitions の `" + slot + "` は30分刻みで定義してください。");
        return;
      }

      if (startMinutes >= endMinutes) {
        errors.push("slotDefinitions の `" + slot + "` は開始より後の終了時刻が必要です。");
      }
    });

    return {
      ok: errors.length === 0,
      slots: errors.length === 0 ? slots.slice() : [],
      slotDefinitions: errors.length === 0 ? cloneData(slotDefinitions) : {},
      errors: errors
    };
  }

  function createBoundariesFromData(sourceData) {
    if (Array.isArray(sourceData.timeBoundaries) && sourceData.timeBoundaries.length > 0) {
      return sourceData.timeBoundaries.slice();
    }

    return createBoundariesFromSlotDefinitions(sourceData.slots, sourceData.slotDefinitions);
  }

  function createBoundariesFromSlotDefinitions(slots, slotDefinitions) {
    const boundaries = [];

    if (!Array.isArray(slots) || slots.length === 0) {
      return ["09:00", "20:00"];
    }

    slots.forEach(function (slot, index) {
      const definition = slotDefinitions ? slotDefinitions[slot] : null;

      if (!definition) {
        return;
      }

      if (index === 0) {
        boundaries.push(definition.start);
      }

      boundaries.push(definition.end);
    });

    return boundaries.length >= 2 ? boundaries : ["09:00", "20:00"];
  }

  function normalizeRequirements(rawRequirements, days, slots) {
    const matrix = {};
    const errors = {};
    const messages = [];
    let hasMissingOrInvalid = false;

    days.forEach(function (day) {
      const dayRequirements = rawRequirements && rawRequirements[day];
      const dayErrors = {};

      matrix[day] = {};
      errors[day] = dayErrors;

      slots.forEach(function (slot) {
        const value = dayRequirements ? dayRequirements[slot] : undefined;

        if (!isValidRequirementValue(value)) {
          matrix[day][slot] = 0;
          dayErrors[slot] = buildRequirementErrorMessage(day, slot, value);
          hasMissingOrInvalid = true;
          return;
        }

        matrix[day][slot] = Number(value);
      });

      if (dayRequirements && typeof dayRequirements === "object") {
        Object.keys(dayRequirements).forEach(function (slot) {
          if (slots.indexOf(slot) === -1) {
            messages.push(day + " の必要人数に未使用シフト `" + slot + "` があります。");
          }
        });
      }
    });

    if (hasMissingOrInvalid) {
      messages.unshift("必要人数定義に不整合があります。該当セルを確認してください。");
    }

    return {
      matrix: matrix,
      errors: errors,
      messages: messages
    };
  }

  function cloneNumericRequirementMatrix(requirements, days, slots) {
    const cloned = {};

    days.forEach(function (day) {
      cloned[day] = {};

      slots.forEach(function (slot) {
        cloned[day][slot] = Number(requirements[day][slot]) || 0;
      });
    });

    return cloned;
  }

  function createAdminDraftFromData(sourceData) {
    return {
      timeBoundaries: createBoundariesFromData(sourceData),
      requirements: cloneRequirementMatrix(sourceData.requirements, sourceData.days, sourceData.slots)
    };
  }

  function cloneRequirementMatrix(requirements, days, slots) {
    const cloned = {};

    days.forEach(function (day) {
      cloned[day] = {};

      slots.forEach(function (slot) {
        cloned[day][slot] = getDraftRequirementValue(requirements, day, slot);
      });
    });

    return cloned;
  }

  function getDraftRequirementValue(requirements, day, slot) {
    if (!requirements || !requirements[day] || typeof requirements[day][slot] === "undefined") {
      return "0";
    }

    return String(requirements[day][slot]);
  }

  function createNextBoundaryTime(boundaries) {
    const lastBoundary = boundaries[boundaries.length - 1];
    const lastMinutes = parseTimeToMinutes(lastBoundary);

    if (lastMinutes === null) {
      return "";
    }

    const nextMinutes = Math.min(lastMinutes + 120, 23 * 60 + 30);

    if (nextMinutes <= lastMinutes) {
      return "";
    }

    return formatMinutesToTime(nextMinutes);
  }

  function validateAdminDraft(data, adminDraft) {
    const boundaryResult = buildScheduleConfigFromBoundaries(adminDraft.timeBoundaries);

    if (!boundaryResult.ok) {
      return {
        ok: false,
        boundaryResult: boundaryResult,
        requirementValidation: createEmptyDraftRequirementValidation(data.days),
        messages: boundaryResult.errors
      };
    }

    const requirementValidation = normalizeDraftRequirements(adminDraft.requirements, data.days, boundaryResult.slots);

    return {
      ok: requirementValidation.messages.length === 0,
      boundaryResult: boundaryResult,
      requirementValidation: requirementValidation,
      messages: requirementValidation.messages
    };
  }

  function createEmptyDraftRequirementValidation(days) {
    const errors = {};

    days.forEach(function (day) {
      errors[day] = {};
    });

    return {
      matrix: {},
      errors: errors,
      messages: []
    };
  }

  function normalizeDraftRequirements(rawRequirements, days, slots) {
    const matrix = {};
    const errors = {};
    const messages = [];
    let hasError = false;

    days.forEach(function (day) {
      matrix[day] = {};
      errors[day] = {};

      slots.forEach(function (slot) {
        const rawValue = getDraftRequirementValue(rawRequirements, day, slot);
        const numericValue = Number(rawValue);

        if (!isValidDraftRequirementValue(rawValue)) {
          matrix[day][slot] = 0;
          errors[day][slot] = "0以上の整数で入力してください。";
          hasError = true;
          return;
        }

        matrix[day][slot] = numericValue;
      });
    });

    if (hasError) {
      messages.push("必要人数の下書きに不正な値があります。");
    }

    return {
      matrix: matrix,
      errors: errors,
      messages: messages
    };
  }

  function isValidDraftRequirementValue(value) {
    if (value === "") {
      return false;
    }

    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue >= 0;
  }

  function applyAdminDraftToData(data, adminDraft, validation) {
    data.timeBoundaries = adminDraft.timeBoundaries.slice();
    data.slots = validation.boundaryResult.slots;
    data.slotDefinitions = validation.boundaryResult.slotDefinitions;
    data.requirements = validation.requirementValidation.matrix;
    data.requirementErrors = validation.requirementValidation.errors;
    data.configurationErrors = [];

    syncStaffSlotsFromTimeRanges(data.staff, data.days, data.slots, data.slotDefinitions);
    return data;
  }

  function ensureStaffSlotState(staffMembers, days, slots, slotDefinitions) {
    if (slots.length === 0 || Object.keys(slotDefinitions).length === 0) {
      staffMembers.forEach(function (staff) {
        staff.availability = createEmptyAvailability(days);
        staff.preferences = [];
      });
      return;
    }

    staffMembers.forEach(function (staff) {
      if (hasUsableSlotState(staff, days, slots)) {
        const normalized = normalizeSlotState(staff.availability, staff.preferences, days, slots);
        staff.availability = normalized.availability;
        staff.preferences = normalized.preferences;
        return;
      }

      const gridStates = createGridStatesFromTimeRanges(
        staff.timeRanges,
        days,
        slots,
        slotDefinitions,
        getOperatingBounds(slotDefinitions)
      );
      applyGridStatesToStaff(staff, gridStates, days, slots);
    });
  }

  function hasUsableSlotState(staff, days, slots) {
    const hasAvailability = staff.availability && typeof staff.availability === "object";
    const hasPreferences = Array.isArray(staff.preferences);

    if (!hasAvailability && !hasPreferences) {
      return false;
    }

    if (hasAvailability) {
      for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
        const values = staff.availability[days[dayIndex]];

        if (typeof values === "undefined") {
          continue;
        }

        if (!Array.isArray(values)) {
          return false;
        }

        for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
          if (slots.indexOf(values[valueIndex]) === -1) {
            return false;
          }
        }
      }
    }

    if (hasPreferences) {
      for (let index = 0; index < staff.preferences.length; index += 1) {
        const preference = staff.preferences[index];

        if (
          !preference ||
          days.indexOf(preference.day) === -1 ||
          slots.indexOf(preference.slot) === -1
        ) {
          return false;
        }
      }
    }

    return true;
  }

  function normalizeSlotState(rawAvailability, rawPreferences, days, slots) {
    const availability = createEmptyAvailability(days);
    const preferences = [];

    days.forEach(function (day) {
      const values =
        rawAvailability && Array.isArray(rawAvailability[day])
          ? rawAvailability[day]
          : [];

      values.forEach(function (slot) {
        if (slots.indexOf(slot) !== -1 && availability[day].indexOf(slot) === -1) {
          availability[day].push(slot);
        }
      });
    });

    if (Array.isArray(rawPreferences)) {
      rawPreferences.forEach(function (preference) {
        if (!preference || days.indexOf(preference.day) === -1 || slots.indexOf(preference.slot) === -1) {
          return;
        }

        if (availability[preference.day].indexOf(preference.slot) === -1) {
          availability[preference.day].push(preference.slot);
        }

        preferences.push({
          day: preference.day,
          slot: preference.slot
        });
      });
    }

    return {
      availability: availability,
      preferences: preferences
    };
  }

  function createEmptyAvailability(days) {
    const availability = {};

    days.forEach(function (day) {
      availability[day] = [];
    });

    return availability;
  }

  function syncStaffSlotsFromTimeRanges(staffMembers, days, slots, slotDefinitions) {
    const bounds = getOperatingBounds(slotDefinitions);

    staffMembers.forEach(function (staff) {
      const gridStates = createGridStatesFromTimeRanges(staff.timeRanges, days, slots, slotDefinitions, bounds);
      applyGridStatesToStaff(staff, gridStates, days, slots);
    });
  }

  function createPreferenceEditorState(staffMembers, days, slots, bounds) {
    const selectedStaff = staffMembers[0] || null;

    if (!selectedStaff) {
      return {
        selectedStaffId: "",
        timeRanges: normalizeTimeRanges(null, days),
        timeErrors: createEmptyTimeErrors(days),
        gridStates: createBlockedGridStates(days, slots)
      };
    }

    const timeRanges = createTimeRangesFromStaff(selectedStaff, days);

    return {
      selectedStaffId: selectedStaff.id,
      timeRanges: timeRanges,
      timeErrors: createTimeErrorsFromTimeRanges(timeRanges, days, bounds),
      gridStates: createGridStatesFromStaff(selectedStaff, days, slots)
    };
  }

  function normalizeTimeRanges(timeRanges, days) {
    const normalized = {};

    days.forEach(function (day) {
      normalized[day] = {
        start: timeRanges && timeRanges[day] ? timeRanges[day].start || "" : "",
        end: timeRanges && timeRanges[day] ? timeRanges[day].end || "" : ""
      };
    });

    return normalized;
  }

  function createTimeRangesFromStaff(staff, days) {
    return normalizeTimeRanges(staff ? staff.timeRanges : null, days);
  }

  function createEmptyTimeErrors(days) {
    const errors = {};

    days.forEach(function (day) {
      errors[day] = "";
    });

    return errors;
  }

  function createTimeErrorsFromTimeRanges(timeRanges, days, bounds) {
    const errors = createEmptyTimeErrors(days);

    days.forEach(function (day) {
      const validation = validateTimeRange(timeRanges[day], bounds);
      errors[day] = validation.kind === "invalid" ? validation.error : "";
    });

    return errors;
  }

  function createGridStatesFromTimeRanges(timeRanges, days, slots, slotDefinitions, bounds) {
    const gridStates = {};

    days.forEach(function (day) {
      const validation = validateTimeRange(timeRanges[day], bounds);

      gridStates[day] = {};

      slots.forEach(function (slot) {
        gridStates[day][slot] = convertValidationToSlotState(validation, slotDefinitions[slot]);
      });
    });

    return gridStates;
  }

  function createGridStatesFromStaff(staff, days, slots) {
    const gridStates = {};

    days.forEach(function (day) {
      gridStates[day] = {};

      slots.forEach(function (slot) {
        gridStates[day][slot] = getStateFromStaffSlot(staff, day, slot);
      });
    });

    return gridStates;
  }

  function createBlockedGridStates(days, slots) {
    const gridStates = {};

    days.forEach(function (day) {
      gridStates[day] = {};

      slots.forEach(function (slot) {
        gridStates[day][slot] = "blocked";
      });
    });

    return gridStates;
  }

  function applyTimeRangeToGridStates(editorState, day, data, bounds) {
    const validation = validateTimeRange(editorState.timeRanges[day], bounds);
    editorState.timeErrors[day] = validation.kind === "invalid" ? validation.error : "";

    if (validation.kind === "invalid") {
      return false;
    }

    data.slots.forEach(function (slot) {
      editorState.gridStates[day][slot] = convertValidationToSlotState(validation, data.slotDefinitions[slot]);
    });

    return true;
  }

  function cyclePreferenceState(gridStates, day, slot) {
    const currentState = gridStates[day][slot];
    const currentIndex = PREFERENCE_STATES.indexOf(currentState);
    const nextIndex = (currentIndex + 1) % PREFERENCE_STATES.length;

    gridStates[day][slot] = PREFERENCE_STATES[nextIndex];
  }

  function applyGridStatesToStaff(staff, gridStates, days, slots) {
    const nextAvailability = {};
    const nextPreferences = [];

    days.forEach(function (day) {
      nextAvailability[day] = [];

      slots.forEach(function (slot) {
        const state = gridStates[day][slot];

        if (state === "available" || state === "preferred") {
          nextAvailability[day].push(slot);
        }

        if (state === "preferred") {
          nextPreferences.push({ day: day, slot: slot });
        }
      });
    });

    staff.availability = nextAvailability;
    staff.preferences = nextPreferences;
  }

  function mergeSavedTimeRanges(currentTimeRanges, editorTimeRanges, timeErrors, days) {
    const merged = normalizeTimeRanges(currentTimeRanges, days);

    days.forEach(function (day) {
      if (!timeErrors[day]) {
        merged[day] = {
          start: editorTimeRanges[day].start,
          end: editorTimeRanges[day].end
        };
      }
    });

    return merged;
  }

  function getStateFromStaffSlot(staff, day, slot) {
    if (isPreferredSlot(staff, day, slot)) {
      return "preferred";
    }

    if (canWorkSlot(staff, day, slot)) {
      return "available";
    }

    return "blocked";
  }

  function getInvalidTimeRangeDays(timeErrors) {
    return Object.keys(timeErrors).filter(function (day) {
      return Boolean(timeErrors[day]);
    });
  }

  function validateTimeRange(timeRange, bounds) {
    if (!bounds) {
      return { kind: "invalid", error: "固定シフト定義が不正です。" };
    }

    if (!timeRange || (!timeRange.start && !timeRange.end)) {
      return { kind: "empty" };
    }

    if (!timeRange.start || !timeRange.end) {
      return { kind: "invalid", error: "開始と終了を両方入力してください。" };
    }

    const startMinutes = parseTimeToMinutes(timeRange.start);
    const endMinutes = parseTimeToMinutes(timeRange.end);

    if (startMinutes === null || endMinutes === null) {
      return { kind: "invalid", error: "時刻形式が不正です。" };
    }

    if (!isThirtyMinuteStep(startMinutes) || !isThirtyMinuteStep(endMinutes)) {
      return { kind: "invalid", error: "30分刻みで入力してください。" };
    }

    if (startMinutes < bounds.startMinutes || endMinutes > bounds.endMinutes) {
      return {
        kind: "invalid",
        error: bounds.startText + "〜" + bounds.endText + " の範囲で入力してください。"
      };
    }

    if (startMinutes >= endMinutes) {
      return { kind: "invalid", error: "開始時刻は終了時刻より前にしてください。" };
    }

    return {
      kind: "valid",
      startMinutes: startMinutes,
      endMinutes: endMinutes
    };
  }

  function convertValidationToSlotState(validation, slotDefinition) {
    if (validation.kind === "invalid" || validation.kind === "empty" || !slotDefinition) {
      return "blocked";
    }

    const slotStart = parseTimeToMinutes(slotDefinition.start);
    const slotEnd = parseTimeToMinutes(slotDefinition.end);
    const overlapMinutes = calculateOverlapMinutes(
      validation.startMinutes,
      validation.endMinutes,
      slotStart,
      slotEnd
    );
    const slotDuration = slotEnd - slotStart;

    if (overlapMinutes === 0) {
      return "blocked";
    }

    if (overlapMinutes < slotDuration / 2) {
      return "available";
    }

    return "preferred";
  }

  function getOperatingBounds(slotDefinitions) {
    const slotNames = Object.keys(slotDefinitions || {});

    if (slotNames.length === 0) {
      return null;
    }

    const starts = [];
    const ends = [];

    slotNames.forEach(function (slot) {
      const definition = slotDefinitions[slot];
      const start = parseTimeToMinutes(definition && definition.start);
      const end = parseTimeToMinutes(definition && definition.end);

      if (start !== null) {
        starts.push(start);
      }

      if (end !== null) {
        ends.push(end);
      }
    });

    if (starts.length === 0 || ends.length === 0) {
      return null;
    }

    const startMinutes = Math.min.apply(null, starts);
    const endMinutes = Math.max.apply(null, ends);

    return {
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      startText: formatMinutesToTime(startMinutes),
      endText: formatMinutesToTime(endMinutes)
    };
  }

  function parseTimeToMinutes(timeText) {
    if (!/^\d{2}:\d{2}$/.test(timeText || "")) {
      return null;
    }

    const parts = timeText.split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }

  function formatMinutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0");
  }

  function isThirtyMinuteStep(minutes) {
    return minutes % 30 === 0;
  }

  function calculateOverlapMinutes(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  }

  function describeTimeRangeStatus(timeRange) {
    if (!timeRange || (!timeRange.start && !timeRange.end)) {
      return "未入力です。";
    }

    return "入力値: " + (timeRange.start || "--:--") + " - " + (timeRange.end || "--:--");
  }

  function summarizeTimeRanges(timeRanges, days) {
    const normalized = normalizeTimeRanges(timeRanges, days);
    const summary = days
      .filter(function (day) {
        return normalized[day].start && normalized[day].end;
      })
      .map(function (day) {
        return day + "(" + normalized[day].start + "-" + normalized[day].end + ")";
      })
      .join(" / ");

    return summary || "なし";
  }

  function summarizeAvailability(availability) {
    if (!availability || typeof availability !== "object") {
      return "なし";
    }

    const summary = Object.keys(availability)
      .filter(function (day) {
        return Array.isArray(availability[day]) && availability[day].length > 0;
      })
      .map(function (day) {
        return day + "(" + availability[day].join("・") + ")";
      })
      .join(" / ");

    return summary || "なし";
  }

  function summarizePreferences(preferences) {
    if (!Array.isArray(preferences)) {
      return "なし";
    }

    const summary = preferences
      .map(function (item) {
        return item.day + " " + item.slot;
      })
      .join(" / ");

    return summary || "なし";
  }

  function formatSlotLabel(slot, slotDefinitions) {
    const definition = slotDefinitions[slot];

    if (!definition) {
      return slot;
    }

    const rangeLabel = definition.start + "-" + definition.end;

    if (slot === rangeLabel) {
      return slot;
    }

    return slot + " (" + rangeLabel + ")";
  }

  function getRequirementError(requirementErrors, day, slot) {
    return requirementErrors && requirementErrors[day] ? requirementErrors[day][slot] || "" : "";
  }

  function isValidRequirementValue(value) {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue >= 0;
  }

  function buildRequirementErrorMessage(day, slot, value) {
    if (typeof value === "undefined") {
      return day + " の `" + slot + "` に必要人数が定義されていません。";
    }

    return day + " の `" + slot + "` の必要人数 `" + value + "` は 0 以上の整数で定義してください。";
  }

  function buildConfigurationErrorMessage(messages) {
    if (!messages || messages.length === 0) {
      return "";
    }

    return "シフト定義エラー: " + messages.join(" ");
  }

  function generateSchedule(sourceData) {
    const data = createEditableData(sourceData);
    const assignmentCounts = createAssignmentCounts(data.staff);
    const schedule = createEmptySchedule(data.days, data.slots, data.requirements);
    const slotQueue = buildSlotQueue(data);
    const staffLookup = createStaffLookup(data.staff);
    const totalRequired = countTotalRequired(data.requirements, data.days, data.slots);
    const operatingBounds = getOperatingBounds(data.slotDefinitions);
    let filledCount = 0;
    let cellsWithTimeShortage = 0;

    slotQueue.forEach(function (slotInfo, index) {
      const futureSlots = slotQueue.slice(index + 1);
      const slotResult = assignStaffToSlot(slotInfo, data.staff, assignmentCounts, futureSlots);

      slotResult.timeShortages = computeTimeShortagesForSlot(
        slotInfo.day,
        slotInfo.slot,
        slotResult.staffIds,
        slotInfo.required,
        staffLookup,
        data.slotDefinitions,
        operatingBounds
      );

      schedule[slotInfo.day][slotInfo.slot] = slotResult;
      filledCount += slotResult.staffIds.length;

      if (slotResult.timeShortages.length > 0) {
        cellsWithTimeShortage += 1;
      }
    });

    return {
      schedule: schedule,
      totalRequired: totalRequired,
      filledCount: filledCount,
      shortageCount: totalRequired - filledCount,
      fulfilledCells: countFulfilledCells(schedule, data.days, data.slots),
      cellsWithTimeShortage: cellsWithTimeShortage
    };
  }

  function createEmptySchedule(days, slots, requirements) {
    const schedule = {};

    days.forEach(function (day) {
      schedule[day] = {};

      slots.forEach(function (slot) {
        schedule[day][slot] = {
          required: requirements[day][slot],
          staffIds: [],
          shortage: requirements[day][slot],
          timeShortages: []
        };
      });
    });

    return schedule;
  }

  function buildSlotQueue(sourceData) {
    const queue = [];

    sourceData.days.forEach(function (day, dayIndex) {
      sourceData.slots.forEach(function (slot, slotIndex) {
        queue.push({
          day: day,
          slot: slot,
          required: sourceData.requirements[day][slot],
          order: dayIndex * sourceData.slots.length + slotIndex,
          eligibleCount: estimateEligibleCount(day, slot, sourceData.staff)
        });
      });
    });

    queue.sort(function (left, right) {
      if (left.eligibleCount !== right.eligibleCount) {
        return left.eligibleCount - right.eligibleCount;
      }

      if (left.required !== right.required) {
        return right.required - left.required;
      }

      return left.order - right.order;
    });

    return queue;
  }

  function estimateEligibleCount(day, slot, staffMembers) {
    return staffMembers.filter(function (staff) {
      return canWorkSlot(staff, day, slot);
    }).length;
  }

  function assignStaffToSlot(slotInfo, staffMembers, assignmentCounts, futureSlots) {
    const assignedStaffIds = [];

    for (let index = 0; index < slotInfo.required; index += 1) {
      const candidate = pickBestCandidate(
        slotInfo.day,
        slotInfo.slot,
        staffMembers,
        assignmentCounts,
        assignedStaffIds,
        futureSlots
      );

      if (!candidate) {
        break;
      }

      assignedStaffIds.push(candidate.id);
      assignmentCounts[candidate.id] += 1;
    }

    return {
      required: slotInfo.required,
      staffIds: assignedStaffIds,
      shortage: slotInfo.required - assignedStaffIds.length
    };
  }

  function pickBestCandidate(day, slot, staffMembers, assignmentCounts, assignedStaffIds, futureSlots) {
    const candidates = staffMembers
      .filter(function (staff) {
        return isEligibleCandidate(staff, day, slot, assignmentCounts, assignedStaffIds);
      })
      .map(function (staff) {
        return buildCandidateSnapshot(staff, day, slot, assignmentCounts, futureSlots);
      });

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort(compareCandidates);
    return candidates[0].staff;
  }

  function isEligibleCandidate(staff, day, slot, assignmentCounts, assignedStaffIds) {
    if (!canWorkSlot(staff, day, slot)) {
      return false;
    }

    if (assignedStaffIds.indexOf(staff.id) !== -1) {
      return false;
    }

    return assignmentCounts[staff.id] < staff.maxShifts;
  }

  function buildCandidateSnapshot(staff, day, slot, assignmentCounts, futureSlots) {
    const currentCount = assignmentCounts[staff.id];

    return {
      staff: staff,
      preferred: isPreferredSlot(staff, day, slot),
      minimumGap: Math.max(0, staff.minShifts - currentCount),
      remainingOpportunities: countRemainingOpportunities(staff, futureSlots),
      currentCount: currentCount
    };
  }

  function compareCandidates(left, right) {
    if (left.remainingOpportunities !== right.remainingOpportunities) {
      return left.remainingOpportunities - right.remainingOpportunities;
    }

    if (left.preferred !== right.preferred) {
      return left.preferred ? -1 : 1;
    }

    if (left.minimumGap !== right.minimumGap) {
      return right.minimumGap - left.minimumGap;
    }

    if (left.currentCount !== right.currentCount) {
      return left.currentCount - right.currentCount;
    }

    return left.staff.name.localeCompare(right.staff.name, "ja");
  }

  function countRemainingOpportunities(staff, futureSlots) {
    return futureSlots.filter(function (slotInfo) {
      return canWorkSlot(staff, slotInfo.day, slotInfo.slot);
    }).length;
  }

  function canWorkSlot(staff, day, slot) {
    return Boolean(staff && staff.availability && Array.isArray(staff.availability[day]) && staff.availability[day].indexOf(slot) !== -1);
  }

  function isPreferredSlot(staff, day, slot) {
    return Boolean(
      staff &&
        Array.isArray(staff.preferences) &&
        staff.preferences.some(function (preference) {
          return preference.day === day && preference.slot === slot;
        })
    );
  }

  function createAssignmentCounts(staffMembers) {
    const counts = {};

    staffMembers.forEach(function (staff) {
      counts[staff.id] = 0;
    });

    return counts;
  }

  function createStaffLookup(staffMembers) {
    const lookup = {};

    staffMembers.forEach(function (staff) {
      lookup[staff.id] = staff;
    });

    return lookup;
  }

  function formatAssignedStaff(staffIds, staffLookup) {
    if (!staffIds || staffIds.length === 0) {
      return "なし";
    }

    return staffIds
      .map(function (staffId) {
        return staffLookup[staffId] ? staffLookup[staffId].name : staffId;
      })
      .join(" / ");
  }

  function countTotalRequired(requirements, days, slots) {
    let total = 0;

    days.forEach(function (day) {
      slots.forEach(function (slot) {
        total += requirements[day][slot];
      });
    });

    return total;
  }

  function countFulfilledCells(schedule, days, slots) {
    let total = 0;

    days.forEach(function (day) {
      slots.forEach(function (slot) {
        if (schedule[day][slot].shortage === 0 && schedule[day][slot].timeShortages.length === 0) {
          total += 1;
        }
      });
    });

    return total;
  }

  function computeTimeShortagesForSlot(day, slot, staffIds, requiredCount, staffLookup, slotDefinitions, bounds) {
    const slotDefinition = slotDefinitions[slot];

    if (!slotDefinition || !bounds) {
      return [];
    }

    const buckets = createSlotBuckets(slotDefinition);
    const shortages = buckets.map(function (bucket) {
      const coveredCount = staffIds.filter(function (staffId) {
        return coversBucket(staffLookup[staffId], day, bucket.startMinutes, bucket.endMinutes, bounds);
      }).length;

      return {
        startMinutes: bucket.startMinutes,
        endMinutes: bucket.endMinutes,
        shortage: Math.max(0, requiredCount - coveredCount)
      };
    });

    return mergeShortageBuckets(shortages);
  }

  function createSlotBuckets(slotDefinition) {
    const startMinutes = parseTimeToMinutes(slotDefinition.start);
    const endMinutes = parseTimeToMinutes(slotDefinition.end);
    const buckets = [];

    if (startMinutes === null || endMinutes === null) {
      return buckets;
    }

    for (let cursor = startMinutes; cursor < endMinutes; cursor += 30) {
      buckets.push({
        startMinutes: cursor,
        endMinutes: cursor + 30
      });
    }

    return buckets;
  }

  function coversBucket(staff, day, bucketStart, bucketEnd, bounds) {
    const validation = validateTimeRange(
      staff && staff.timeRanges ? staff.timeRanges[day] || { start: "", end: "" } : { start: "", end: "" },
      bounds
    );

    return (
      validation.kind === "valid" &&
      validation.startMinutes <= bucketStart &&
      validation.endMinutes >= bucketEnd
    );
  }

  function mergeShortageBuckets(shortages) {
    const merged = [];

    shortages.forEach(function (item) {
      if (item.shortage === 0) {
        return;
      }

      const previous = merged[merged.length - 1];

      if (previous && previous.shortage === item.shortage && previous.endMinutes === item.startMinutes) {
        previous.endMinutes = item.endMinutes;
        previous.end = formatMinutesToTime(item.endMinutes);
        return;
      }

      merged.push({
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        start: formatMinutesToTime(item.startMinutes),
        end: formatMinutesToTime(item.endMinutes),
        shortage: item.shortage
      });
    });

    return merged;
  }

  window.ShiftAutoCore = {
    PREFERENCE_STATES: PREFERENCE_STATES,
    PREFERENCE_STATE_META: PREFERENCE_STATE_META,
    applyAdminDraftToData: applyAdminDraftToData,
    applyGridStatesToStaff: applyGridStatesToStaff,
    applyTimeRangeToGridStates: applyTimeRangeToGridStates,
    buildConfigurationErrorMessage: buildConfigurationErrorMessage,
    buildScheduleConfigFromBoundaries: buildScheduleConfigFromBoundaries,
    cloneData: cloneData,
    cloneRequirementMatrix: cloneRequirementMatrix,
    createAdminDraftFromData: createAdminDraftFromData,
    createEditableData: createEditableData,
    createGridStatesFromStaff: createGridStatesFromStaff,
    createNextBoundaryTime: createNextBoundaryTime,
    createPreferenceEditorState: createPreferenceEditorState,
    createStaffLookup: createStaffLookup,
    createTimeErrorsFromTimeRanges: createTimeErrorsFromTimeRanges,
    createTimeRangesFromStaff: createTimeRangesFromStaff,
    cyclePreferenceState: cyclePreferenceState,
    describeTimeRangeStatus: describeTimeRangeStatus,
    formatAssignedStaff: formatAssignedStaff,
    formatSlotLabel: formatSlotLabel,
    generateSchedule: generateSchedule,
    getDraftRequirementValue: getDraftRequirementValue,
    getInvalidTimeRangeDays: getInvalidTimeRangeDays,
    getOperatingBounds: getOperatingBounds,
    getRequirementError: getRequirementError,
    isValidDraftRequirementValue: isValidDraftRequirementValue,
    mergeSavedTimeRanges: mergeSavedTimeRanges,
    normalizeDraftRequirements: normalizeDraftRequirements,
    normalizeTimeRanges: normalizeTimeRanges,
    serializeAppData: serializeAppData,
    summarizeAvailability: summarizeAvailability,
    summarizePreferences: summarizePreferences,
    summarizeTimeRanges: summarizeTimeRanges,
    syncStaffSlotsFromTimeRanges: syncStaffSlotsFromTimeRanges,
    validateAdminDraft: validateAdminDraft,
    validateTimeRange: validateTimeRange
  };
})();

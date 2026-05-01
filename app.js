(function () {
  const PREFERENCE_STATES = ["blocked", "available", "preferred"];
  const PREFERENCE_STATE_META = {
    blocked: { label: "不可", className: "state-blocked" },
    available: { label: "可", className: "state-available" },
    preferred: { label: "希望", className: "state-preferred" }
  };

  const data = createEditableData(window.SAMPLE_DATA);
  const staffList = document.getElementById("staff-list");
  const staffSelect = document.getElementById("staff-select");
  const timeRangeEditor = document.getElementById("time-range-editor");
  const preferenceGrid = document.getElementById("preference-grid");
  const preferenceStatus = document.getElementById("preference-status");
  const savePreferencesButton = document.getElementById("save-preferences-button");
  const requirementsTable = document.getElementById("requirements-table");
  const requirementsEditor = document.getElementById("requirements-editor");
  const shiftBoundaryEditor = document.getElementById("shift-boundary-editor");
  const shiftPreview = document.getElementById("shift-preview");
  const adminConfigStatus = document.getElementById("admin-config-status");
  const addBoundaryButton = document.getElementById("add-boundary-button");
  const applySettingsButton = document.getElementById("apply-settings-button");
  const resetSettingsButton = document.getElementById("reset-settings-button");
  const adminView = document.getElementById("admin-view");
  const staffView = document.getElementById("staff-view");
  const adminViewButton = document.getElementById("admin-view-button");
  const staffViewButton = document.getElementById("staff-view-button");
  const statusMessage = document.getElementById("status-message");
  const generateButton = document.getElementById("generate-button");
  let operatingBounds = getOperatingBounds(data ? data.slotDefinitions : null);

  if (
    !data ||
    !staffList ||
    !staffSelect ||
    !timeRangeEditor ||
    !preferenceGrid ||
    !preferenceStatus ||
    !savePreferencesButton ||
    !requirementsTable ||
    !requirementsEditor ||
    !shiftBoundaryEditor ||
    !shiftPreview ||
    !adminConfigStatus ||
    !addBoundaryButton ||
    !applySettingsButton ||
    !resetSettingsButton ||
    !adminView ||
    !staffView ||
    !adminViewButton ||
    !staffViewButton ||
    !statusMessage ||
    !generateButton
  ) {
    return;
  }

  const staffLookup = createStaffLookup(data.staff);
  const editorState = createPreferenceEditorState(data.staff, data.days, data.slots, operatingBounds);
  const adminDraft = createAdminDraftFromData(data);
  let lastScheduleResult = null;

  setActiveView("admin");
  renderStaffList(data.staff);
  renderStaffSelector(data.staff, editorState.selectedStaffId);
  renderAdminDraft();
  renderTimeRangeEditor(data.days, editorState.timeRanges, editorState.timeErrors);
  renderPreferenceGrid(data.days, data.slots, data.slotDefinitions, editorState.gridStates);
  renderRequirementsTable(
    data.days,
    data.slots,
    data.slotDefinitions,
    data.requirements,
    data.requirementErrors,
    lastScheduleResult
  );
  if (data.configurationErrors.length > 0) {
    updateStatusMessage(buildConfigurationErrorMessage(data.configurationErrors), "warning");
  }
  updatePreferenceStatus(
    getSelectedStaff().name + " の時刻入力を変更すると、その曜日のグリッドを自動更新します。必要ならセルを手動で微調整してください。",
    "info"
  );

  generateButton.addEventListener("click", handleGenerateClick);
  adminViewButton.addEventListener("click", function () {
    setActiveView("admin");
  });
  staffViewButton.addEventListener("click", function () {
    setActiveView("staff");
  });
  staffSelect.addEventListener("change", handleStaffChange);
  timeRangeEditor.addEventListener("input", handleTimeRangeInput);
  preferenceGrid.addEventListener("click", handlePreferenceGridClick);
  savePreferencesButton.addEventListener("click", handleSavePreferences);
  shiftBoundaryEditor.addEventListener("input", handleBoundaryInput);
  shiftBoundaryEditor.addEventListener("click", handleBoundaryClick);
  addBoundaryButton.addEventListener("click", handleAddBoundary);
  requirementsEditor.addEventListener("input", handleDraftRequirementInput);
  applySettingsButton.addEventListener("click", handleApplySettings);
  resetSettingsButton.addEventListener("click", handleResetSettings);

  function setActiveView(viewName) {
    const isAdmin = viewName === "admin";

    adminView.hidden = !isAdmin;
    staffView.hidden = isAdmin;
    adminViewButton.classList.toggle("is-active", isAdmin);
    staffViewButton.classList.toggle("is-active", !isAdmin);
    adminViewButton.setAttribute("aria-pressed", String(isAdmin));
    staffViewButton.setAttribute("aria-pressed", String(!isAdmin));
  }

  function handleBoundaryInput(event) {
    const input = event.target;

    if (!input.matches("input[data-boundary-index]")) {
      return;
    }

    adminDraft.timeBoundaries[Number(input.dataset.boundaryIndex)] = input.value;
    renderAdminDraft();
  }

  function handleBoundaryClick(event) {
    const button = event.target.closest("button[data-remove-boundary-index]");

    if (!button) {
      return;
    }

    adminDraft.timeBoundaries.splice(Number(button.dataset.removeBoundaryIndex), 1);
    renderAdminDraft();
  }

  function handleAddBoundary() {
    adminDraft.timeBoundaries.push(createNextBoundaryTime(adminDraft.timeBoundaries));
    renderAdminDraft("境界時刻を下書きに追加しました。必要なら時刻を調整してください。", "info");
  }

  function handleDraftRequirementInput(event) {
    const input = event.target;

    if (!input.matches("input[data-requirement-day][data-requirement-slot]")) {
      return;
    }

    const day = input.dataset.requirementDay;
    const slot = input.dataset.requirementSlot;

    if (!adminDraft.requirements[day]) {
      adminDraft.requirements[day] = {};
    }

    adminDraft.requirements[day][slot] = input.value;
    input.classList.toggle("is-invalid", !isValidDraftRequirementValue(input.value));

    const validation = validateAdminDraft();
    if (!validation.ok) {
      updateAdminConfigStatus(validation.messages.join(" "), "warning");
      return;
    }

    updateAdminConfigStatus("必要人数の下書きを更新しました。適用するには「設定を適用する」を押してください。", "info");
  }

  function handleApplySettings() {
    const validation = validateAdminDraft();

    if (!validation.ok) {
      renderAdminDraft(validation.messages.join(" "), "warning");
      return;
    }

    applyAdminDraft(validation);
  }

  function handleResetSettings() {
    replaceAdminDraft(createAdminDraftFromData(data));
    renderAdminDraft("下書きを現在の有効な設定に戻しました。", "info");
  }

  function handleGenerateClick() {
    if (data.configurationErrors.length > 0) {
      lastScheduleResult = null;
      renderRequirementsTable(
        data.days,
        data.slots,
        data.slotDefinitions,
        data.requirements,
        data.requirementErrors,
        null
      );
      updateStatusMessage(buildConfigurationErrorMessage(data.configurationErrors), "warning");
      return;
    }

    lastScheduleResult = generateSchedule(data);
    renderRequirementsTable(
      data.days,
      data.slots,
      data.slotDefinitions,
      data.requirements,
      data.requirementErrors,
      lastScheduleResult
    );
    updateStatusSummary(lastScheduleResult);
  }

  function handleStaffChange(event) {
    editorState.selectedStaffId = event.target.value;
    editorState.timeRanges = createTimeRangesFromStaff(getSelectedStaff(), data.days);
    editorState.timeErrors = createTimeErrorsFromTimeRanges(editorState.timeRanges, data.days, operatingBounds);
    editorState.gridStates = createGridStatesFromStaff(getSelectedStaff(), data.days, data.slots);
    renderTimeRangeEditor(data.days, editorState.timeRanges, editorState.timeErrors);
    renderPreferenceGrid(data.days, data.slots, data.slotDefinitions, editorState.gridStates);
    updatePreferenceStatus(
      getSelectedStaff().name + " の時刻入力とグリッドを編集中です。変更を反映するには「希望を反映する」を押してください。",
      "info"
    );
  }

  function handleTimeRangeInput(event) {
    const input = event.target;

    if (!input.matches("input[data-day][data-field]")) {
      return;
    }

    const day = input.dataset.day;
    const field = input.dataset.field;

    editorState.timeRanges[day][field] = input.value;
    applyTimeRangeToEditorDay(day);
    renderTimeRangeEditor(data.days, editorState.timeRanges, editorState.timeErrors);
    renderPreferenceGrid(data.days, data.slots, data.slotDefinitions, editorState.gridStates);
    updatePreferenceStatus(buildTimeRangeStatusMessage(), getTimeRangeStatusTone());
  }

  function handlePreferenceGridClick(event) {
    const button = event.target.closest("button[data-day][data-slot]");

    if (!button) {
      return;
    }

    cyclePreferenceState(button.dataset.day, button.dataset.slot);
    renderPreferenceGrid(data.days, data.slots, data.slotDefinitions, editorState.gridStates);
    updatePreferenceStatus(
      getSelectedStaff().name + " の希望に未保存の変更があります。「希望を反映する」を押すと反映されます。",
      "info"
    );
  }

  function handleSavePreferences() {
    const selectedStaff = getSelectedStaff();
    const invalidDays = getInvalidTimeRangeDays(editorState.timeErrors);

    selectedStaff.timeRanges = mergeSavedTimeRanges(
      selectedStaff.timeRanges,
      editorState.timeRanges,
      editorState.timeErrors,
      data.days
    );
    applyGridStatesToStaff(selectedStaff, editorState.gridStates, data.days, data.slots);
    renderStaffList(data.staff);
    clearGeneratedSchedule();
    renderTimeRangeEditor(data.days, editorState.timeRanges, editorState.timeErrors);

    if (invalidDays.length > 0) {
      updatePreferenceStatus(
        selectedStaff.name +
          " の希望を反映しました。時刻入力は " +
          invalidDays.join("・") +
          " を反映していません。",
        "warning"
      );
      return;
    }

    updatePreferenceStatus(selectedStaff.name + " の希望を反映しました。スタッフ一覧を更新しました。", "success");
  }

  function renderAdminDraft(statusOverride, toneOverride) {
    const validation = validateAdminDraft();

    renderBoundaryEditor(adminDraft.timeBoundaries, validation.boundaryResult);
    renderShiftPreview(validation.boundaryResult);

    if (validation.boundaryResult.ok) {
      renderRequirementsEditor(
        data.days,
        validation.boundaryResult.slots,
        adminDraft.requirements,
        validation.requirementValidation
      );
    } else {
      renderRequirementsEditorUnavailable(validation.boundaryResult.errors);
    }

    if (statusOverride) {
      updateAdminConfigStatus(statusOverride, toneOverride || "info");
      return;
    }

    if (!validation.ok) {
      updateAdminConfigStatus(validation.messages.join(" "), "warning");
      return;
    }

    updateAdminConfigStatus(
      "下書きは適用可能です。変更を反映するには「設定を適用する」を押してください。",
      "info"
    );
  }

  function renderBoundaryEditor(boundaries, boundaryResult) {
    const list = document.createElement("div");
    list.className = "boundary-list";

    boundaries.forEach(function (boundary, index) {
      const row = document.createElement("div");
      row.className = "boundary-row";

      const label = document.createElement("label");
      label.className = "field-label";
      label.textContent = "境界 " + (index + 1);

      const input = document.createElement("input");
      input.type = "time";
      input.className = "time-input" + (boundaryResult.ok ? "" : " is-invalid");
      input.step = "1800";
      input.value = boundary;
      input.dataset.boundaryIndex = String(index);
      input.setAttribute("aria-label", "境界時刻 " + (index + 1));

      label.appendChild(input);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "small-button";
      removeButton.textContent = "削除";
      removeButton.dataset.removeBoundaryIndex = String(index);
      removeButton.disabled = boundaries.length <= 2;

      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });

    shiftBoundaryEditor.replaceChildren(list);
  }

  function renderShiftPreview(boundaryResult) {
    const title = document.createElement("span");
    title.className = "shift-preview-title";
    title.textContent = "生成される定義済みシフト";

    if (!boundaryResult.ok) {
      const error = document.createElement("span");
      error.className = "time-range-error";
      error.textContent = boundaryResult.errors.join(" ");
      shiftPreview.replaceChildren(title, error);
      return;
    }

    const list = document.createElement("ul");
    list.className = "shift-preview-list";

    boundaryResult.slots.forEach(function (slot) {
      const item = document.createElement("li");
      item.className = "shift-preview-item";
      item.textContent = slot;
      list.appendChild(item);
    });

    shiftPreview.replaceChildren(title, list);
  }

  function renderRequirementsEditor(days, slots, draftRequirements, requirementValidation) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "requirements-table draft-requirements-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "時間帯";
    headerRow.appendChild(corner);

    days.forEach(function (day) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = day;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    slots.forEach(function (slot) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.className = "slot-label";
      labelCell.textContent = slot;
      row.appendChild(labelCell);

      days.forEach(function (day) {
        const cell = document.createElement("td");
        const input = document.createElement("input");
        const value = getDraftRequirementValue(draftRequirements, day, slot);
        const error = requirementValidation.errors[day] ? requirementValidation.errors[day][slot] : "";

        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.className = "number-input" + (error ? " is-invalid" : "");
        input.value = value;
        input.dataset.requirementDay = day;
        input.dataset.requirementSlot = slot;
        input.setAttribute("aria-label", day + " " + slot + " の必要人数");

        cell.appendChild(input);

        if (error) {
          const errorMessage = document.createElement("span");
          errorMessage.className = "time-range-error";
          errorMessage.textContent = error;
          cell.appendChild(errorMessage);
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    requirementsEditor.replaceChildren(tableWrap);
  }

  function renderRequirementsEditorUnavailable(messages) {
    const status = document.createElement("div");
    status.className = "status status-warning";
    status.textContent =
      "境界時刻の下書きが不正なため、必要人数表を更新できません。 " + messages.join(" ");

    requirementsEditor.replaceChildren(status);
  }

  function updateAdminConfigStatus(message, tone) {
    applyStatusMessage(adminConfigStatus, message, tone);
  }

  function renderStaffList(staffMembers) {
    const fragment = document.createDocumentFragment();

    staffMembers.forEach(function (staff) {
      const card = document.createElement("article");
      card.className = "staff-card";

      const title = document.createElement("h3");
      title.textContent = staff.name;

      const meta = document.createElement("p");
      meta.className = "staff-meta";
      meta.textContent =
        "週の勤務回数: 最小 " + staff.minShifts + "回 / 最大 " + staff.maxShifts + "回";

      const availability = document.createElement("p");
      availability.className = "staff-detail";
      availability.innerHTML =
        "<strong>勤務可能:</strong> " + summarizeAvailability(staff.availability);

      const timeRange = document.createElement("p");
      timeRange.className = "staff-detail";
      timeRange.innerHTML =
        "<strong>時刻入力:</strong> " + summarizeTimeRanges(staff.timeRanges, data.days);

      const preferences = document.createElement("p");
      preferences.className = "staff-detail";
      preferences.innerHTML =
        "<strong>希望:</strong> " + summarizePreferences(staff.preferences);

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(availability);
      card.appendChild(timeRange);
      card.appendChild(preferences);
      fragment.appendChild(card);
    });

    staffList.replaceChildren(fragment);
  }

  function renderStaffSelector(staffMembers, selectedStaffId) {
    const fragment = document.createDocumentFragment();

    staffMembers.forEach(function (staff) {
      const option = document.createElement("option");
      option.value = staff.id;
      option.textContent = staff.name;
      option.selected = staff.id === selectedStaffId;
      fragment.appendChild(option);
    });

    staffSelect.replaceChildren(fragment);
    staffSelect.value = selectedStaffId;
  }

  function renderTimeRangeEditor(days, timeRanges, timeErrors) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "time-input-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["曜日", "開始時刻", "終了時刻", "入力状態"].forEach(function (label) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    days.forEach(function (day) {
      const row = document.createElement("tr");
      const errorMessage = timeErrors[day];

      row.className = "time-range-row" + (errorMessage ? " is-error" : "");

      const dayCell = document.createElement("th");
      dayCell.scope = "row";
      dayCell.textContent = day;
      row.appendChild(dayCell);

      ["start", "end"].forEach(function (field) {
        const cell = document.createElement("td");
        const input = document.createElement("input");

        input.type = "time";
        input.className = "time-input";
        input.min = operatingBounds ? operatingBounds.startText : "00:00";
        input.max = operatingBounds ? operatingBounds.endText : "23:30";
        input.step = "1800";
        input.value = timeRanges[day][field];
        input.dataset.day = day;
        input.dataset.field = field;
        input.setAttribute("aria-label", day + " の" + (field === "start" ? "開始時刻" : "終了時刻"));

        cell.appendChild(input);
        row.appendChild(cell);
      });

      const statusCell = document.createElement("td");

      if (errorMessage) {
        const error = document.createElement("span");
        error.className = "time-range-error";
        error.textContent = errorMessage;
        statusCell.appendChild(error);
      } else {
        const hint = document.createElement("span");
        hint.className = "time-range-hint";
        hint.textContent = describeTimeRangeStatus(timeRanges[day]);
        statusCell.appendChild(hint);
      }

      row.appendChild(statusCell);
      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    timeRangeEditor.replaceChildren(tableWrap);
  }

  function renderPreferenceGrid(days, slots, slotDefinitions, gridStates) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "requirements-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "時間帯";
    headerRow.appendChild(corner);

    days.forEach(function (day) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = day;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    slots.forEach(function (slot) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.className = "slot-label";
      labelCell.textContent = formatSlotLabel(slot, slotDefinitions);
      row.appendChild(labelCell);

      days.forEach(function (day) {
        const cell = document.createElement("td");
        const button = document.createElement("button");
        const state = gridStates[day][slot];
        const meta = PREFERENCE_STATE_META[state];

        button.type = "button";
        button.className = "preference-button " + meta.className;
        button.dataset.day = day;
        button.dataset.slot = slot;
        button.textContent = meta.label;
        button.setAttribute("aria-label", day + " " + slot + " は現在 " + meta.label);

        cell.appendChild(button);
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    preferenceGrid.replaceChildren(tableWrap);
  }

  function renderRequirementsTable(days, slots, slotDefinitions, requirements, requirementErrors, result) {
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const corner = document.createElement("th");
    corner.textContent = "時間帯";
    headerRow.appendChild(corner);

    days.forEach(function (day) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = day;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    slots.forEach(function (slot) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.className = "slot-label";
      labelCell.textContent = formatSlotLabel(slot, slotDefinitions);
      row.appendChild(labelCell);

      days.forEach(function (day) {
        const cell = document.createElement("td");
        const count = document.createElement("span");
        count.className = "cell-count";
        const assigned = document.createElement("span");
        assigned.className = "cell-assigned";
        const note = document.createElement("span");
        const detail = document.createElement("span");
        detail.className = "cell-shortage-detail";
        const slotRequirementError = getRequirementError(requirementErrors, day, slot);
        const slotResult = result ? result.schedule[day][slot] : null;

        if (slotRequirementError) {
          count.textContent = "必要人数: 定義エラー";
          assigned.textContent = "割り当て: ---";
          note.className = "cell-shortage is-shortage";
          note.textContent = "枠単位の不足: 計算不可";
          fillConfigurationDetail(detail, slotRequirementError);
        } else if (slotResult) {
          count.textContent = "必要人数: " + requirements[day][slot] + "人";
          assigned.textContent = "割り当て: " + formatAssignedStaff(slotResult.staffIds);
          note.className = "cell-shortage" + (slotResult.shortage > 0 ? " is-shortage" : "");
          note.textContent = "枠単位の不足: " + slotResult.shortage + "人";
          fillShortageDetail(detail, slotResult.timeShortages);
        } else {
          count.textContent = "必要人数: " + requirements[day][slot] + "人";
          assigned.textContent = "割り当て: 未生成";
          note.className = "cell-note";
          note.textContent = "枠単位の不足: 未生成";
          detail.textContent = "時間帯別不足: 未生成";
        }

        cell.appendChild(count);
        cell.appendChild(assigned);
        cell.appendChild(note);
        cell.appendChild(detail);
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    requirementsTable.replaceChildren(thead, tbody);
  }

  function createAdminDraftFromData(sourceData) {
    return {
      timeBoundaries: createBoundariesFromData(sourceData),
      requirements: cloneRequirementMatrix(sourceData.requirements, sourceData.days, sourceData.slots)
    };
  }

  function replaceAdminDraft(nextDraft) {
    adminDraft.timeBoundaries = nextDraft.timeBoundaries;
    adminDraft.requirements = nextDraft.requirements;
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
      const definition = slotDefinitions[slot];

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

  function validateAdminDraft() {
    const boundaryResult = buildScheduleConfigFromBoundaries(adminDraft.timeBoundaries);

    if (!boundaryResult.ok) {
      return {
        ok: false,
        boundaryResult: boundaryResult,
        requirementValidation: createEmptyDraftRequirementValidation(data.days),
        messages: boundaryResult.errors
      };
    }

    const requirementValidation = normalizeDraftRequirements(
      adminDraft.requirements,
      data.days,
      boundaryResult.slots
    );

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

  function applyAdminDraft(validation) {
    data.timeBoundaries = adminDraft.timeBoundaries.slice();
    data.slots = validation.boundaryResult.slots;
    data.slotDefinitions = validation.boundaryResult.slotDefinitions;
    data.requirements = validation.requirementValidation.matrix;
    data.requirementErrors = validation.requirementValidation.errors;
    data.configurationErrors = [];
    operatingBounds = getOperatingBounds(data.slotDefinitions);

    syncStaffSlotsFromTimeRanges(data.staff, data.days, data.slots, data.slotDefinitions);
    refreshEditorStateFromSelectedStaff();
    replaceAdminDraft(createAdminDraftFromData(data));
    lastScheduleResult = null;

    renderStaffList(data.staff);
    renderTimeRangeEditor(data.days, editorState.timeRanges, editorState.timeErrors);
    renderPreferenceGrid(data.days, data.slots, data.slotDefinitions, editorState.gridStates);
    renderRequirementsTable(
      data.days,
      data.slots,
      data.slotDefinitions,
      data.requirements,
      data.requirementErrors,
      null
    );
    renderAdminDraft(
      "設定を適用しました。シフト定義変更により、スタッフのslot単位希望は時刻入力から再計算しました。",
      "success"
    );
    updateStatusMessage(
      "設定を適用しました。新しいシフト構成で生成するには「シフト生成」を押してください。",
      "info"
    );
    updatePreferenceStatus(
      "シフト定義が変更されたため、表示中スタッフのグリッドは時刻入力から再計算しました。",
      "warning"
    );
  }

  function refreshEditorStateFromSelectedStaff() {
    editorState.timeRanges = createTimeRangesFromStaff(getSelectedStaff(), data.days);
    editorState.timeErrors = createTimeErrorsFromTimeRanges(editorState.timeRanges, data.days, operatingBounds);
    editorState.gridStates = createGridStatesFromStaff(getSelectedStaff(), data.days, data.slots);
  }

  function createEditableData(sourceData) {
    if (!sourceData) {
      return null;
    }

    const clonedData = JSON.parse(JSON.stringify(sourceData));
    const scheduleConfig = resolveScheduleConfig(clonedData);

    clonedData.slots = scheduleConfig.slots;
    clonedData.slotDefinitions = scheduleConfig.slotDefinitions;
    clonedData.configurationErrors = scheduleConfig.errors.slice();

    const requirementValidation = normalizeRequirements(
      clonedData.requirements,
      clonedData.days,
      clonedData.slots
    );
    clonedData.requirements = requirementValidation.matrix;
    clonedData.requirementErrors = requirementValidation.errors;
    clonedData.configurationErrors = clonedData.configurationErrors.concat(requirementValidation.messages);
    ensureTimeRanges(clonedData.staff, clonedData.days);

    if (clonedData.slots.length > 0 && Object.keys(clonedData.slotDefinitions).length > 0) {
      syncStaffSlotsFromTimeRanges(clonedData.staff, clonedData.days, clonedData.slots, clonedData.slotDefinitions);
    }

    return clonedData;
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
      slotDefinitions: errors.length === 0 ? JSON.parse(JSON.stringify(slotDefinitions)) : {},
      errors: errors
    };
  }

  function normalizeRequirements(rawRequirements, days, slots) {
    const matrix = {};
    const errors = {};
    const messages = [];
    let hasMissingOrInvalid = false;

    if (slots.length === 0) {
      days.forEach(function (day) {
        matrix[day] = {};
        errors[day] = {};
      });

      return {
        matrix: matrix,
        errors: errors,
        messages: messages
      };
    }

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

        matrix[day][slot] = value;
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

  function createPreferenceEditorState(staffMembers, days, slots, bounds) {
    const selectedStaff = staffMembers[0];
    const timeRanges = createTimeRangesFromStaff(selectedStaff, days);

    return {
      selectedStaffId: selectedStaff.id,
      timeRanges: timeRanges,
      timeErrors: createTimeErrorsFromTimeRanges(timeRanges, days, bounds),
      gridStates: createGridStatesFromStaff(selectedStaff, days, slots)
    };
  }

  function ensureTimeRanges(staffMembers, days) {
    staffMembers.forEach(function (staff) {
      staff.timeRanges = normalizeTimeRanges(staff.timeRanges, days);
    });
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

  function syncStaffSlotsFromTimeRanges(staffMembers, days, slots, slotDefinitions) {
    const bounds = getOperatingBounds(slotDefinitions);

    staffMembers.forEach(function (staff) {
      const gridStates = createGridStatesFromTimeRanges(staff.timeRanges, days, slots, slotDefinitions, bounds);
      applyGridStatesToStaff(staff, gridStates, days, slots);
    });
  }

  function createTimeRangesFromStaff(staff, days) {
    return normalizeTimeRanges(staff.timeRanges, days);
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

  function getStateFromStaffSlot(staff, day, slot) {
    if (isPreferredSlot(staff, day, slot)) {
      return "preferred";
    }

    if (canWorkSlot(staff, day, slot)) {
      return "available";
    }

    return "blocked";
  }

  function applyTimeRangeToEditorDay(day) {
    const validation = validateTimeRange(editorState.timeRanges[day], operatingBounds);

    editorState.timeErrors[day] = validation.kind === "invalid" ? validation.error : "";

    if (validation.kind === "invalid") {
      return;
    }

    data.slots.forEach(function (slot) {
      editorState.gridStates[day][slot] = convertValidationToSlotState(validation, data.slotDefinitions[slot]);
    });
  }

  function cyclePreferenceState(day, slot) {
    const currentState = editorState.gridStates[day][slot];
    const currentIndex = PREFERENCE_STATES.indexOf(currentState);
    const nextIndex = (currentIndex + 1) % PREFERENCE_STATES.length;

    editorState.gridStates[day][slot] = PREFERENCE_STATES[nextIndex];
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

  function getSelectedStaff() {
    return staffLookup[editorState.selectedStaffId];
  }

  function clearGeneratedSchedule() {
    lastScheduleResult = null;
    renderRequirementsTable(
      data.days,
      data.slots,
      data.slotDefinitions,
      data.requirements,
      data.requirementErrors,
      null
    );

    if (data.configurationErrors.length > 0) {
      updateStatusMessage(buildConfigurationErrorMessage(data.configurationErrors), "warning");
      return;
    }

    updateStatusMessage(
      "希望入力を更新しました。新しい希望を反映するには、もう一度「シフト生成」を押してください。",
      "info"
    );
  }

  function getRequirementError(requirementErrors, day, slot) {
    return requirementErrors && requirementErrors[day] ? requirementErrors[day][slot] || "" : "";
  }

  function isValidRequirementValue(value) {
    return Number.isInteger(value) && value >= 0;
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

  function getInvalidTimeRangeDays(timeErrors) {
    return Object.keys(timeErrors).filter(function (day) {
      return Boolean(timeErrors[day]);
    });
  }

  function buildTimeRangeStatusMessage() {
    const invalidDays = getInvalidTimeRangeDays(editorState.timeErrors);

    if (invalidDays.length > 0) {
      return invalidDays.join("・") + " の時刻入力が不正です。該当曜日はグリッド自動変換を行っていません。";
    }

    return getSelectedStaff().name + " の時刻入力を更新しました。必要ならグリッドを手動で微調整してください。";
  }

  function getTimeRangeStatusTone() {
    return getInvalidTimeRangeDays(editorState.timeErrors).length > 0 ? "warning" : "info";
  }

  function validateTimeRange(timeRange, bounds) {
    if (!bounds) {
      return { kind: "invalid", error: "固定シフト定義が不正です。" };
    }

    if (!timeRange.start && !timeRange.end) {
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
    if (validation.kind === "invalid" || validation.kind === "empty") {
      return validation.kind === "empty" ? "blocked" : null;
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

    const startMinutes = Math.min.apply(
      null,
      slotNames.map(function (slot) {
        return parseTimeToMinutes(slotDefinitions[slot].start);
      })
    );
    const endMinutes = Math.max.apply(
      null,
      slotNames.map(function (slot) {
        return parseTimeToMinutes(slotDefinitions[slot].end);
      })
    );

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

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
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
    if (!timeRange.start && !timeRange.end) {
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

  function formatSlotLabel(slot, slotDefinitions) {
    const definition = slotDefinitions[slot];
    const rangeLabel = definition.start + "-" + definition.end;

    if (slot === rangeLabel) {
      return slot;
    }

    return slot + " (" + rangeLabel + ")";
  }

  function fillShortageDetail(container, timeShortages) {
    container.replaceChildren();

    const title = document.createElement("span");
    title.className = "cell-shortage-title";
    title.textContent = "時間帯別不足:";
    container.appendChild(title);

    if (!timeShortages || timeShortages.length === 0) {
      const none = document.createElement("span");
      none.className = "cell-shortage-line";
      none.textContent = "なし";
      container.appendChild(none);
      return;
    }

    timeShortages.forEach(function (item) {
      const line = document.createElement("span");
      line.className = "cell-shortage-line";
      line.textContent = item.start + " - " + item.end + ": " + item.shortage + "人不足";
      container.appendChild(line);
    });
  }

  function fillConfigurationDetail(container, message) {
    container.replaceChildren();

    const title = document.createElement("span");
    title.className = "cell-shortage-title";
    title.textContent = "設定エラー:";
    container.appendChild(title);

    const line = document.createElement("span");
    line.className = "cell-shortage-line";
    line.textContent = message;
    container.appendChild(line);
  }

  function summarizeAvailability(availability) {
    const summary = Object.keys(availability)
      .filter(function (day) {
        return availability[day].length > 0;
      })
      .map(function (day) {
        return day + "(" + availability[day].join("・") + ")";
      })
      .join(" / ");

    return summary || "なし";
  }

  function summarizePreferences(preferences) {
    const summary = preferences
      .map(function (item) {
        return item.day + " " + item.slot;
      })
      .join(" / ");

    return summary || "なし";
  }

  function generateSchedule(sourceData) {
    const assignmentCounts = createAssignmentCounts(sourceData.staff);
    const schedule = createEmptySchedule(sourceData.days, sourceData.slots, sourceData.requirements);
    const slotQueue = buildSlotQueue(sourceData);
    const localStaffLookup = createStaffLookup(sourceData.staff);
    const totalRequired = countTotalRequired(sourceData.requirements, sourceData.days, sourceData.slots);
    let filledCount = 0;
    let cellsWithTimeShortage = 0;

    slotQueue.forEach(function (slotInfo, index) {
      const futureSlots = slotQueue.slice(index + 1);
      const slotResult = assignStaffToSlot(slotInfo, sourceData.staff, assignmentCounts, futureSlots);

      slotResult.timeShortages = computeTimeShortagesForSlot(
        slotInfo.day,
        slotInfo.slot,
        slotResult.staffIds,
        slotInfo.required,
        localStaffLookup,
        sourceData.slotDefinitions
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
      fulfilledCells: countFulfilledCells(schedule, sourceData.days, sourceData.slots),
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
          shortage: requirements[day][slot]
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
    return Array.isArray(staff.availability[day]) && staff.availability[day].indexOf(slot) !== -1;
  }

  function isPreferredSlot(staff, day, slot) {
    return staff.preferences.some(function (preference) {
      return preference.day === day && preference.slot === slot;
    });
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

  function formatAssignedStaff(staffIds) {
    if (staffIds.length === 0) {
      return "なし";
    }

    return staffIds
      .map(function (staffId) {
        return staffLookup[staffId].name;
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

  function updateStatusSummary(result) {
    const totalCells = data.days.length * data.slots.length;
    const summary =
      "必要 " +
      result.totalRequired +
      "人枠のうち " +
      result.filledCount +
      "人枠を割り当てました。充足セルは " +
      result.fulfilledCells +
      "/" +
      totalCells +
      " です。";

    if (result.shortageCount > 0 || result.cellsWithTimeShortage > 0) {
      updateStatusMessage(
        summary +
          " 枠単位の不足は " +
          result.shortageCount +
          "人、時間帯別不足があるセルは " +
          result.cellsWithTimeShortage +
          " 個です。",
        "warning"
      );
      return;
    }

    updateStatusMessage(summary + " 不足はありません。", "success");
  }

  function computeTimeShortagesForSlot(day, slot, staffIds, requiredCount, localStaffLookup, slotDefinitions) {
    const buckets = createSlotBuckets(slotDefinitions[slot]);
    const shortages = buckets.map(function (bucket) {
      const coveredCount = staffIds.filter(function (staffId) {
        return coversBucket(localStaffLookup[staffId], day, bucket.startMinutes, bucket.endMinutes);
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

    for (let cursor = startMinutes; cursor < endMinutes; cursor += 30) {
      buckets.push({
        startMinutes: cursor,
        endMinutes: cursor + 30
      });
    }

    return buckets;
  }

  function coversBucket(staff, day, bucketStart, bucketEnd) {
    const validation = validateTimeRange(
      staff && staff.timeRanges ? staff.timeRanges[day] || { start: "", end: "" } : { start: "", end: "" },
      operatingBounds
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

  function updateStatusMessage(message, tone) {
    applyStatusMessage(statusMessage, message, tone);
  }

  function updatePreferenceStatus(message, tone) {
    applyStatusMessage(preferenceStatus, message, tone);
  }

  function applyStatusMessage(targetElement, message, tone) {
    targetElement.textContent = message;
    targetElement.className = "status " + getStatusClassName(tone);
  }

  function getStatusClassName(tone) {
    if (tone === "success") {
      return "status-success";
    }

    if (tone === "warning") {
      return "status-warning";
    }

    return "status-info";
  }
})();

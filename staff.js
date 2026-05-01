(function () {
  const Core = window.ShiftAutoCore;
  const Storage = window.ShiftAutoStorage;

  if (!Core || !Storage) {
    return;
  }

  const elements = {
    dataStatus: document.getElementById("data-status"),
    preferenceStatus: document.getElementById("preference-status"),
    staffSelect: document.getElementById("staff-select"),
    timeRangeEditor: document.getElementById("time-range-editor"),
    preferenceGrid: document.getElementById("preference-grid"),
    savePreferencesButton: document.getElementById("save-preferences-button")
  };

  if (Object.keys(elements).some(function (key) { return !elements[key]; })) {
    return;
  }

  const loadResult = Storage.loadAppData();
  let data = loadResult.data;
  let staffLookup = {};
  let operatingBounds = null;
  let editorState = null;

  refreshDerivedState();
  resetEditorState(data.staff[0] ? data.staff[0].id : "");
  renderAll();
  updateDataStatus(loadResult.message, loadResult.tone);
  updateInitialPreferenceStatus();

  elements.staffSelect.addEventListener("change", handleStaffChange);
  elements.timeRangeEditor.addEventListener("input", handleTimeRangeInput);
  elements.preferenceGrid.addEventListener("click", handlePreferenceGridClick);
  elements.savePreferencesButton.addEventListener("click", handleSavePreferences);

  function handleStaffChange(event) {
    resetEditorState(event.target.value);
    renderEditors();
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
    Core.applyTimeRangeToGridStates(editorState, day, data, operatingBounds);
    renderEditors();
    updatePreferenceStatus(buildTimeRangeStatusMessage(), getTimeRangeStatusTone());
  }

  function handlePreferenceGridClick(event) {
    const button = event.target.closest("button[data-day][data-slot]");

    if (!button) {
      return;
    }

    Core.cyclePreferenceState(editorState.gridStates, button.dataset.day, button.dataset.slot);
    renderPreferenceGrid();
    updatePreferenceStatus(
      getSelectedStaff().name + " の希望に未保存の変更があります。「希望を反映する」を押すと保存されます。",
      "info"
    );
  }

  function handleSavePreferences() {
    const selectedStaff = getSelectedStaff();

    if (!selectedStaff) {
      updatePreferenceStatus("保存できるスタッフがありません。", "warning");
      return;
    }

    const invalidDays = Core.getInvalidTimeRangeDays(editorState.timeErrors);

    selectedStaff.timeRanges = Core.mergeSavedTimeRanges(
      selectedStaff.timeRanges,
      editorState.timeRanges,
      editorState.timeErrors,
      data.days
    );
    Core.applyGridStatesToStaff(selectedStaff, editorState.gridStates, data.days, data.slots);

    const saveResult = Storage.saveAppData(data);
    data = saveResult.data;
    refreshDerivedState();
    resetEditorState(selectedStaff.id);
    renderAll();
    updateDataStatus(saveResult.message, saveResult.tone);

    if (!saveResult.ok) {
      updatePreferenceStatus(saveResult.message, "warning");
      return;
    }

    if (invalidDays.length > 0) {
      updatePreferenceStatus(
        selectedStaff.name +
          " の希望を保存しました。時刻入力は " +
          invalidDays.join("・") +
          " を保存していません。",
        "warning"
      );
      return;
    }

    updatePreferenceStatus(selectedStaff.name + " の希望を保存しました。管理者画面のシフト生成に反映されます。", "success");
  }

  function refreshDerivedState() {
    staffLookup = Core.createStaffLookup(data.staff);
    operatingBounds = Core.getOperatingBounds(data.slotDefinitions);
  }

  function resetEditorState(staffId) {
    const selectedStaff = staffLookup[staffId] || data.staff[0] || null;
    const selectedStaffId = selectedStaff ? selectedStaff.id : "";
    const timeRanges = Core.createTimeRangesFromStaff(selectedStaff, data.days);

    editorState = {
      selectedStaffId: selectedStaffId,
      timeRanges: timeRanges,
      timeErrors: Core.createTimeErrorsFromTimeRanges(timeRanges, data.days, operatingBounds),
      gridStates: Core.createGridStatesFromStaff(selectedStaff, data.days, data.slots)
    };
  }

  function renderAll() {
    renderStaffSelector();
    renderEditors();
  }

  function renderEditors() {
    renderTimeRangeEditor();
    renderPreferenceGrid();
  }

  function renderStaffSelector() {
    const fragment = document.createDocumentFragment();

    data.staff.forEach(function (staff) {
      const option = document.createElement("option");
      option.value = staff.id;
      option.textContent = staff.name;
      option.selected = staff.id === editorState.selectedStaffId;
      fragment.appendChild(option);
    });

    elements.staffSelect.replaceChildren(fragment);
    elements.staffSelect.value = editorState.selectedStaffId;
    elements.staffSelect.disabled = data.staff.length === 0;
    elements.savePreferencesButton.disabled = data.staff.length === 0 || data.slots.length === 0;
  }

  function renderTimeRangeEditor() {
    if (!getSelectedStaff()) {
      renderPanelMessage(elements.timeRangeEditor, "スタッフが登録されていません。", "warning");
      return;
    }

    if (!operatingBounds) {
      renderPanelMessage(elements.timeRangeEditor, "シフト定義が不正なため、時刻入力を表示できません。", "warning");
      return;
    }

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

    data.days.forEach(function (day) {
      const row = document.createElement("tr");
      const errorMessage = editorState.timeErrors[day];

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
        input.min = operatingBounds.startText;
        input.max = operatingBounds.endText;
        input.step = "1800";
        input.value = editorState.timeRanges[day][field];
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
        hint.textContent = Core.describeTimeRangeStatus(editorState.timeRanges[day]);
        statusCell.appendChild(hint);
      }

      row.appendChild(statusCell);
      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    elements.timeRangeEditor.replaceChildren(tableWrap);
  }

  function renderPreferenceGrid() {
    if (!getSelectedStaff()) {
      renderPanelMessage(elements.preferenceGrid, "スタッフが登録されていません。", "warning");
      return;
    }

    if (data.slots.length === 0) {
      renderPanelMessage(elements.preferenceGrid, "シフト定義が不正なため、希望グリッドを表示できません。", "warning");
      return;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "requirements-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "時間帯";
    headerRow.appendChild(corner);

    data.days.forEach(function (day) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = day;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    data.slots.forEach(function (slot) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.className = "slot-label";
      labelCell.textContent = Core.formatSlotLabel(slot, data.slotDefinitions);
      row.appendChild(labelCell);

      data.days.forEach(function (day) {
        const cell = document.createElement("td");
        const button = document.createElement("button");
        const state = editorState.gridStates[day][slot] || "blocked";
        const meta = Core.PREFERENCE_STATE_META[state] || Core.PREFERENCE_STATE_META.blocked;

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
    elements.preferenceGrid.replaceChildren(tableWrap);
  }

  function renderPanelMessage(target, message, tone) {
    const status = document.createElement("div");
    status.className = "status " + getStatusClassName(tone);
    status.textContent = message;
    target.replaceChildren(status);
  }

  function getSelectedStaff() {
    return staffLookup[editorState.selectedStaffId] || null;
  }

  function updateInitialPreferenceStatus() {
    if (data.configurationErrors.length > 0) {
      updatePreferenceStatus(Core.buildConfigurationErrorMessage(data.configurationErrors), "warning");
      return;
    }

    if (!getSelectedStaff()) {
      updatePreferenceStatus("スタッフが登録されていません。", "warning");
      return;
    }

    updatePreferenceStatus(
      getSelectedStaff().name + " の希望を編集中です。時刻入力またはグリッドを変更し、「希望を反映する」を押してください。",
      "info"
    );
  }

  function buildTimeRangeStatusMessage() {
    const invalidDays = Core.getInvalidTimeRangeDays(editorState.timeErrors);
    const selectedStaff = getSelectedStaff();

    if (invalidDays.length > 0) {
      return invalidDays.join("・") + " の時刻入力が不正です。該当曜日はグリッド自動変換を行っていません。";
    }

    return selectedStaff.name + " の時刻入力を更新しました。必要ならグリッドを手動で微調整してください。";
  }

  function getTimeRangeStatusTone() {
    return Core.getInvalidTimeRangeDays(editorState.timeErrors).length > 0 ? "warning" : "info";
  }

  function updateDataStatus(message, tone) {
    applyStatusMessage(elements.dataStatus, message, tone);
  }

  function updatePreferenceStatus(message, tone) {
    applyStatusMessage(elements.preferenceStatus, message, tone);
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

(function () {
  const Core = window.ShiftAutoCore;
  const Storage = window.ShiftAutoStorage;

  if (!Core || !Storage) {
    return;
  }

  const elements = {
    dataStatus: document.getElementById("data-status"),
    statusMessage: document.getElementById("status-message"),
    generateButton: document.getElementById("generate-button"),
    shiftBoundaryEditor: document.getElementById("shift-boundary-editor"),
    shiftPreview: document.getElementById("shift-preview"),
    adminConfigStatus: document.getElementById("admin-config-status"),
    addBoundaryButton: document.getElementById("add-boundary-button"),
    applySettingsButton: document.getElementById("apply-settings-button"),
    resetSettingsButton: document.getElementById("reset-settings-button"),
    resetDataButton: document.getElementById("reset-data-button"),
    requirementsEditor: document.getElementById("requirements-editor"),
    staffList: document.getElementById("staff-list"),
    requirementsTable: document.getElementById("requirements-table")
  };

  if (Object.keys(elements).some(function (key) { return !elements[key]; })) {
    return;
  }

  const loadResult = Storage.loadAppData();
  let data = loadResult.data;
  let adminDraft = Core.createAdminDraftFromData(data);
  let lastScheduleResult = null;

  renderAll();
  updateDataStatus(loadResult.message, loadResult.tone);
  updateInitialStatus();

  elements.generateButton.addEventListener("click", handleGenerateClick);
  elements.shiftBoundaryEditor.addEventListener("input", handleBoundaryInput);
  elements.shiftBoundaryEditor.addEventListener("click", handleBoundaryClick);
  elements.addBoundaryButton.addEventListener("click", handleAddBoundary);
  elements.requirementsEditor.addEventListener("input", handleDraftRequirementInput);
  elements.applySettingsButton.addEventListener("click", handleApplySettings);
  elements.resetSettingsButton.addEventListener("click", handleResetSettings);
  elements.resetDataButton.addEventListener("click", handleResetData);

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
    adminDraft.timeBoundaries.push(Core.createNextBoundaryTime(adminDraft.timeBoundaries));
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
    input.classList.toggle("is-invalid", !Core.isValidDraftRequirementValue(input.value));

    const validation = Core.validateAdminDraft(data, adminDraft);

    if (!validation.ok) {
      updateAdminConfigStatus(validation.messages.join(" "), "warning");
      elements.applySettingsButton.disabled = true;
      return;
    }

    elements.applySettingsButton.disabled = false;
    updateAdminConfigStatus("必要人数の下書きを更新しました。適用するには「設定を適用する」を押してください。", "info");
  }

  function handleApplySettings() {
    const validation = Core.validateAdminDraft(data, adminDraft);

    if (!validation.ok) {
      renderAdminDraft(validation.messages.join(" "), "warning");
      return;
    }

    Core.applyAdminDraftToData(data, adminDraft, validation);
    lastScheduleResult = null;

    const saveResult = Storage.saveAppData(data);
    data = saveResult.data;
    adminDraft = Core.createAdminDraftFromData(data);

    renderAll();
    updateDataStatus(saveResult.message, saveResult.tone);
    updateAdminConfigStatus(
      "設定を適用しました。シフト定義変更により、スタッフの slot 単位希望は時刻入力から再計算しました。",
      saveResult.ok ? "success" : "warning"
    );
    updateStatusMessage(
      "設定を適用しました。新しいシフト構成で生成するには「シフト生成」を押してください。",
      "info"
    );
  }

  function handleResetSettings() {
    adminDraft = Core.createAdminDraftFromData(data);
    renderAdminDraft("下書きを現在の有効な設定に戻しました。", "info");
  }

  function handleResetData() {
    const confirmed = window.confirm("localStorage の保存データを削除し、sample-data.js の初期データに戻します。よろしいですか？");

    if (!confirmed) {
      return;
    }

    const resetResult = Storage.resetAppData();

    data = Core.createEditableData(window.SAMPLE_DATA);
    adminDraft = Core.createAdminDraftFromData(data);
    lastScheduleResult = null;

    renderAll();
    updateDataStatus(resetResult.message, resetResult.tone);
    updateStatusMessage("sample-data.js の初期データで表示しています。", "info");
  }

  function handleGenerateClick() {
    if (data.configurationErrors.length > 0) {
      lastScheduleResult = null;
      renderRequirementsTable(null);
      updateStatusMessage(Core.buildConfigurationErrorMessage(data.configurationErrors), "warning");
      return;
    }

    lastScheduleResult = Core.generateSchedule(data);
    renderRequirementsTable(lastScheduleResult);
    updateStatusSummary(lastScheduleResult);
  }

  function renderAll() {
    renderAdminDraft();
    renderStaffList();
    renderRequirementsTable(lastScheduleResult);
  }

  function renderAdminDraft(statusOverride, toneOverride) {
    const validation = Core.validateAdminDraft(data, adminDraft);

    renderBoundaryEditor(adminDraft.timeBoundaries, validation.boundaryResult);
    renderShiftPreview(validation.boundaryResult);
    elements.applySettingsButton.disabled = !validation.ok;

    if (validation.boundaryResult.ok) {
      renderRequirementsEditor(
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

    elements.shiftBoundaryEditor.replaceChildren(list);
  }

  function renderShiftPreview(boundaryResult) {
    const title = document.createElement("span");
    title.className = "shift-preview-title";
    title.textContent = "生成される定義済みシフト";

    if (!boundaryResult.ok) {
      const error = document.createElement("span");
      error.className = "time-range-error";
      error.textContent = boundaryResult.errors.join(" ");
      elements.shiftPreview.replaceChildren(title, error);
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

    elements.shiftPreview.replaceChildren(title, list);
  }

  function renderRequirementsEditor(slots, draftRequirements, requirementValidation) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "requirements-table draft-requirements-table";

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

    slots.forEach(function (slot) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.className = "slot-label";
      labelCell.textContent = slot;
      row.appendChild(labelCell);

      data.days.forEach(function (day) {
        const cell = document.createElement("td");
        const input = document.createElement("input");
        const value = Core.getDraftRequirementValue(draftRequirements, day, slot);
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
    elements.requirementsEditor.replaceChildren(tableWrap);
  }

  function renderRequirementsEditorUnavailable(messages) {
    const status = document.createElement("div");
    status.className = "status status-warning";
    status.textContent = "境界時刻の下書きが不正なため、必要人数表を更新できません。 " + messages.join(" ");

    elements.requirementsEditor.replaceChildren(status);
  }

  function renderStaffList() {
    if (data.staff.length === 0) {
      const status = document.createElement("div");
      status.className = "status status-warning";
      status.textContent = "スタッフが登録されていません。";
      elements.staffList.replaceChildren(status);
      return;
    }

    const fragment = document.createDocumentFragment();

    data.staff.forEach(function (staff) {
      const card = document.createElement("article");
      card.className = "staff-card";

      const title = document.createElement("h3");
      title.textContent = staff.name;

      const meta = document.createElement("p");
      meta.className = "staff-meta";
      meta.textContent = "週の勤務回数: 最小 " + staff.minShifts + "回 / 最大 " + staff.maxShifts + "回";

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(createStaffDetail("勤務可能:", Core.summarizeAvailability(staff.availability)));
      card.appendChild(createStaffDetail("時刻入力:", Core.summarizeTimeRanges(staff.timeRanges, data.days)));
      card.appendChild(createStaffDetail("希望:", Core.summarizePreferences(staff.preferences)));
      fragment.appendChild(card);
    });

    elements.staffList.replaceChildren(fragment);
  }

  function createStaffDetail(label, value) {
    const detail = document.createElement("p");
    const strong = document.createElement("strong");

    detail.className = "staff-detail";
    strong.textContent = label + " ";
    detail.appendChild(strong);
    detail.appendChild(document.createTextNode(value));

    return detail;
  }

  function renderRequirementsTable(result) {
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const staffLookup = Core.createStaffLookup(data.staff);

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
        const count = document.createElement("span");
        const assigned = document.createElement("span");
        const note = document.createElement("span");
        const detail = document.createElement("span");
        const slotRequirementError = Core.getRequirementError(data.requirementErrors, day, slot);
        const slotResult = result && result.schedule[day] ? result.schedule[day][slot] : null;

        count.className = "cell-count";
        assigned.className = "cell-assigned";
        detail.className = "cell-shortage-detail";

        if (slotRequirementError) {
          count.textContent = "必要人数: 定義エラー";
          assigned.textContent = "割り当て: ---";
          note.className = "cell-shortage is-shortage";
          note.textContent = "枠単位の不足: 計算不可";
          fillConfigurationDetail(detail, slotRequirementError);
        } else if (slotResult) {
          count.textContent = "必要人数: " + data.requirements[day][slot] + "人";
          assigned.textContent = "割り当て: " + Core.formatAssignedStaff(slotResult.staffIds, staffLookup);
          note.className = "cell-shortage" + (slotResult.shortage > 0 ? " is-shortage" : "");
          note.textContent = "枠単位の不足: " + slotResult.shortage + "人";
          fillShortageDetail(detail, slotResult.timeShortages);
        } else {
          count.textContent = "必要人数: " + data.requirements[day][slot] + "人";
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

    elements.requirementsTable.replaceChildren(thead, tbody);
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

  function updateInitialStatus() {
    if (data.configurationErrors.length > 0) {
      updateStatusMessage(Core.buildConfigurationErrorMessage(data.configurationErrors), "warning");
      return;
    }

    updateStatusMessage("現在有効なデータで表示しています。必要に応じて設定を編集し、シフト生成を実行してください。", "info");
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

  function updateDataStatus(message, tone) {
    applyStatusMessage(elements.dataStatus, message, tone);
  }

  function updateStatusMessage(message, tone) {
    applyStatusMessage(elements.statusMessage, message, tone);
  }

  function updateAdminConfigStatus(message, tone) {
    applyStatusMessage(elements.adminConfigStatus, message, tone);
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

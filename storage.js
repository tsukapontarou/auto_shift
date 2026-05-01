(function () {
  const STORAGE_KEY = "shift-auto-data-v1";

  function loadAppData() {
    const sampleData = getSampleData();
    const storage = getLocalStorage();

    if (!storage) {
      return {
        data: window.ShiftAutoCore.createEditableData(sampleData),
        source: "sample",
        ok: false,
        tone: "warning",
        message: "localStorage を利用できないため、sample-data.js から初期化しました。このページを閉じると変更は残らない可能性があります。"
      };
    }

    let rawData = null;

    try {
      rawData = storage.getItem(STORAGE_KEY);
    } catch (error) {
      return {
        data: window.ShiftAutoCore.createEditableData(sampleData),
        source: "sample",
        ok: false,
        tone: "warning",
        message: "localStorage の読み込みに失敗したため、sample-data.js から初期化しました。"
      };
    }

    if (!rawData) {
      return {
        data: window.ShiftAutoCore.createEditableData(sampleData),
        source: "sample",
        ok: true,
        tone: "info",
        message: "保存済みデータがないため、sample-data.js から初期化しました。"
      };
    }

    try {
      return {
        data: window.ShiftAutoCore.createEditableData(JSON.parse(rawData)),
        source: "localStorage",
        ok: true,
        tone: "success",
        message: "localStorage の保存データを読み込みました。"
      };
    } catch (error) {
      return {
        data: window.ShiftAutoCore.createEditableData(sampleData),
        source: "sample",
        ok: false,
        tone: "warning",
        message: "localStorage の保存データを JSON として読み込めなかったため、sample-data.js から初期化しました。"
      };
    }
  }

  function saveAppData(data) {
    const normalizedData = window.ShiftAutoCore.createEditableData(data);
    const payload = window.ShiftAutoCore.serializeAppData(normalizedData);
    const storage = getLocalStorage();

    if (!storage) {
      return {
        data: normalizedData,
        ok: false,
        tone: "warning",
        message: "localStorage を利用できないため、変更をブラウザ内に保存できませんでした。"
      };
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return {
        data: normalizedData,
        ok: true,
        tone: "success",
        message: "localStorage に保存しました。同じブラウザ内で admin.html と staff.html から参照できます。"
      };
    } catch (error) {
      return {
        data: normalizedData,
        ok: false,
        tone: "warning",
        message: "localStorage への保存に失敗しました。ブラウザの保存制限やプライベートモードを確認してください。"
      };
    }
  }

  function resetAppData() {
    const storage = getLocalStorage();

    if (!storage) {
      return {
        ok: false,
        tone: "warning",
        message: "localStorage を利用できないため、保存データを削除できませんでした。表示は sample-data.js に戻します。"
      };
    }

    try {
      storage.removeItem(STORAGE_KEY);
      return {
        ok: true,
        tone: "success",
        message: "localStorage の保存データを削除し、sample-data.js の初期データに戻しました。"
      };
    } catch (error) {
      return {
        ok: false,
        tone: "warning",
        message: "localStorage の保存データ削除に失敗しました。表示は sample-data.js に戻します。"
      };
    }
  }

  function hasSavedAppData() {
    const storage = getLocalStorage();

    if (!storage) {
      return false;
    }

    try {
      return storage.getItem(STORAGE_KEY) !== null;
    } catch (error) {
      return false;
    }
  }

  function getLocalStorage() {
    try {
      return window.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function getSampleData() {
    return window.SAMPLE_DATA || {
      days: ["月", "火", "水", "木", "金", "土", "日"],
      timeBoundaries: ["09:00", "20:00"],
      staff: [],
      requirements: {}
    };
  }

  window.ShiftAutoStorage = {
    STORAGE_KEY: STORAGE_KEY,
    hasSavedAppData: hasSavedAppData,
    loadAppData: loadAppData,
    resetAppData: resetAppData,
    saveAppData: saveAppData
  };
})();

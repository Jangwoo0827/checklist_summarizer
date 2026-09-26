(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  var LISTS_KEY = "checklist_note_lists_v1";
  var DELETED_KEY = "checklist_note_deleted_v1";

  var changeListeners = [];

  function normalizeList(list) {
    if (!list.checked) list.checked = {};
    if (!list.collapsed) list.collapsed = {};
    if (!list.updatedAt) list.updatedAt = list.createdAt || 0;
    return list;
  }

  // Per-list last-write-wins. `deleted` holds tombstones (id -> deletedAt) so a list
  // removed on one device doesn't come back from another device's stale copy.
  function mergeDocs(a, b) {
    var deleted = {};
    [a.deleted || {}, b.deleted || {}].forEach(function (tomb) {
      Object.keys(tomb).forEach(function (id) {
        deleted[id] = Math.max(deleted[id] || 0, tomb[id]);
      });
    });
    var byId = {};
    [a.lists || [], b.lists || []].forEach(function (lists) {
      lists.forEach(function (list) {
        var cur = byId[list.id];
        if (!cur || (list.updatedAt || 0) > (cur.updatedAt || 0)) byId[list.id] = list;
      });
    });
    var lists = Object.keys(byId)
      .map(function (id) { return byId[id]; })
      .filter(function (list) { return !(deleted[list.id] && deleted[list.id] >= (list.updatedAt || 0)); })
      .sort(function (x, y) { return (x.createdAt || 0) - (y.createdAt || 0); });
    return { lists: lists, deleted: deleted };
  }

  // Postgres jsonb reorders object keys, so compare documents by a key-sorted serialization.
  function stableStringify(value) {
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (k) {
        return JSON.stringify(k) + ":" + stableStringify(value[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function docKey(doc) {
    var lists = (doc.lists || []).slice().sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
    return stableStringify({ lists: lists, deleted: doc.deleted || {} });
  }

  var store = {
    lists: [],
    deleted: {},

    load: function () {
      var lists = util.readJSON(LISTS_KEY, []);
      store.lists = Array.isArray(lists) ? lists.map(normalizeList) : [];
      store.deleted = util.readJSON(DELETED_KEY, {}) || {};
    },

    getList: function (id) {
      for (var i = 0; i < store.lists.length; i++) if (store.lists[i].id === id) return store.lists[i];
      return null;
    },

    // Call after mutating `list` (pass null when only the collection changed).
    commit: function (list) {
      if (list) list.updatedAt = Date.now();
      writeLocal();
      changeListeners.forEach(function (fn) { fn(); });
    },

    addList: function (list) {
      normalizeList(list);
      store.lists.push(list);
      store.commit(list);
    },

    removeList: function (id) {
      store.deleted[id] = Date.now();
      store.lists = store.lists.filter(function (l) { return l.id !== id; });
      store.commit(null);
    },

    // Undo a removeList. commit() stamps a fresh updatedAt, which outranks the
    // tombstone even if another device already received it.
    restoreList: function (list) {
      delete store.deleted[list.id];
      if (!store.getList(list.id)) store.lists.push(list);
      store.commit(list);
    },

    snapshot: function () {
      return { lists: store.lists, deleted: store.deleted };
    },

    // Replace everything with a merged document without triggering another sync.
    applyDoc: function (doc) {
      store.lists = (doc.lists || []).map(normalizeList);
      store.deleted = doc.deleted || {};
      writeLocal();
    },

    clear: function () {
      store.lists = [];
      store.deleted = {};
      writeLocal();
    },

    onChange: function (fn) { changeListeners.push(fn); },

    mergeDocs: mergeDocs,
    docKey: docKey
  };

  function writeLocal() {
    util.writeJSON(LISTS_KEY, store.lists);
    util.writeJSON(DELETED_KEY, store.deleted);
  }

  CN.store = store;
  if (typeof module !== "undefined" && module.exports) module.exports = store;
})(typeof window !== "undefined" ? window : globalThis);

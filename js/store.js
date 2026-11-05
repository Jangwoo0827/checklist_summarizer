(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  var LISTS_KEY = "checklist_note_lists_v1";
  var DELETED_KEY = "checklist_note_deleted_v1";
  var TEMPLATES_KEY = "checklist_note_templates_v1";

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
    function mergeItems(x, y) {
      var byId = {};
      [x || [], y || []].forEach(function (items) {
        items.forEach(function (item) {
          var cur = byId[item.id];
          if (!cur || (item.updatedAt || 0) > (cur.updatedAt || 0)) byId[item.id] = item;
        });
      });
      return Object.keys(byId)
        .map(function (id) { return byId[id]; })
        .filter(function (item) { return !(deleted[item.id] && deleted[item.id] >= (item.updatedAt || 0)); })
        .sort(function (p, q) { return (p.createdAt || 0) - (q.createdAt || 0); });
    }
    return { lists: mergeItems(a.lists, b.lists), templates: mergeItems(a.templates, b.templates), deleted: deleted };
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
    function byId(items) {
      return (items || []).slice().sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
    }
    return stableStringify({ lists: byId(doc.lists), templates: byId(doc.templates), deleted: doc.deleted || {} });
  }

  var store = {
    lists: [],
    templates: [],
    deleted: {},

    load: function () {
      var lists = util.readJSON(LISTS_KEY, []);
      store.lists = Array.isArray(lists) ? lists.map(normalizeList) : [];
      var templates = util.readJSON(TEMPLATES_KEY, []);
      store.templates = Array.isArray(templates) ? templates : [];
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

    // Templates are saved list skeletons ({id, name, text}); "___" marks a blank to fill in.
    getTemplate: function (id) {
      for (var i = 0; i < store.templates.length; i++) if (store.templates[i].id === id) return store.templates[i];
      return null;
    },

    // Saving under an existing name updates that template instead of adding a duplicate.
    saveTemplate: function (name, text) {
      var now = Date.now();
      var same = store.templates.filter(function (t) { return t.name === name; })[0];
      var tpl = same || { id: util.uid(), name: name, createdAt: now };
      tpl.text = text;
      tpl.updatedAt = now;
      if (!same) store.templates.push(tpl);
      store.commit(null);
      return tpl;
    },

    removeTemplate: function (id) {
      store.deleted[id] = Date.now();
      store.templates = store.templates.filter(function (t) { return t.id !== id; });
      store.commit(null);
    },

    restoreTemplate: function (tpl) {
      delete store.deleted[tpl.id];
      if (!store.getTemplate(tpl.id)) store.templates.push(tpl);
      tpl.updatedAt = Date.now(); // outranks the tombstone even if another device already got it
      store.commit(null);
    },

    snapshot: function () {
      return { lists: store.lists, templates: store.templates, deleted: store.deleted };
    },

    // Replace everything with a merged document without triggering another sync.
    applyDoc: function (doc) {
      store.lists = (doc.lists || []).map(normalizeList);
      store.templates = doc.templates || [];
      store.deleted = doc.deleted || {};
      writeLocal();
    },

    clear: function () {
      store.lists = [];
      store.templates = [];
      store.deleted = {};
      writeLocal();
    },

    onChange: function (fn) { changeListeners.push(fn); },

    mergeDocs: mergeDocs,
    docKey: docKey
  };

  function writeLocal() {
    util.writeJSON(LISTS_KEY, store.lists);
    util.writeJSON(TEMPLATES_KEY, store.templates);
    util.writeJSON(DELETED_KEY, store.deleted);
  }

  CN.store = store;
  if (typeof module !== "undefined" && module.exports) module.exports = store;
})(typeof window !== "undefined" ? window : globalThis);

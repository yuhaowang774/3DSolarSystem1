<script setup>
import { ref, computed } from "vue";
import { commands } from "../store/useStore.js";
import { cnNames } from "../js/dats.js";

const query = ref("");
const open = ref(false);

// 中文名统一由 dats.js 维护，避免多处重复定义
const list = Object.keys(cnNames).map((name) => ({
  name,
  cn: cnNames[name],
  en: name.toUpperCase(),
}));

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return list.filter(
    (i) => i.name.includes(q) || i.cn.includes(q) || i.en.toLowerCase().includes(q)
  );
});

function pick(item) {
  query.value = "";
  open.value = false;
  commands.focusBody?.(item.name);
}
</script>

<template>
  <div class="search">
    <input
      v-model="query"
      class="search-input"
      type="text"
      placeholder="SEARCH CELESTIAL BODY"
      @focus="open = true"
      @blur="setTimeout(() => (open = false), 200)"
    />
    <ul v-if="open && results.length" class="search-list">
      <li v-for="item in results" :key="item.name" @mousedown.prevent="pick(item)">
        <span class="en">{{ item.en }}</span>
        <span class="cn">{{ item.cn }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search {
  position: fixed;
  top: 70px;
  left: 32px;
  /* 高于信息面板（30）：面板停靠在搜索栏下方时，联想列表不被遮挡 */
  z-index: 35;
  width: 280px;
}
.search-input {
  width: 100%;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink);
  font-family: "Archivo", sans-serif;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 12px 14px;
  outline: none;
  transition: border-color 0.3s ease;
}
.search-input::placeholder {
  color: var(--muted);
}
.search-input:focus {
  border-color: var(--ink);
}
.search-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 4px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid var(--line);
}
.search-list li {
  display: flex;
  justify-content: space-between;
  padding: 9px 10px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.search-list li:hover {
  background: rgba(240, 240, 250, 0.08);
}
.search-list .en {
  font-family: "Archivo", sans-serif;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--ink);
}
.search-list .cn {
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 768px) {
  .search {
    left: 18px;
    top: 60px;
    width: calc(100vw - 36px);
  }
}
</style>

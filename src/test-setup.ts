import "@testing-library/jest-dom/vitest";

// jsdom 未实现 matchMedia（mermaid 主题跟随系统亮暗需要）
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

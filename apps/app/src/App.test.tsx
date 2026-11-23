import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import { App } from "./App";

afterEach(cleanup);

describe("hello-world page", () => {
  it("renders exactly one level-one heading", () => {
    render(<App />);

    const headings = screen.getAllByRole("heading", { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Hello World");
  });

  it("declares the document title in index.html", () => {
    expect(indexHtml).toContain("<title>Hello World</title>");
  });
});

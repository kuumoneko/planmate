import { describe, expect, it, beforeEach } from "bun:test";
import {
    clearLocalLoginChoice,
    getLocalLoginChoice,
    isMybkUsername,
    normalizeUsername,
    setLocalLoginChoice,
} from "../username-rule";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => store.clear());

describe("isMybkUsername", () => {
    it("accepts two dotted parts of letters/digits", () => {
        expect(isMybkUsername("viet.anh9q1")).toBe(true);
        expect(isMybkUsername("khanh.nguyen")).toBe(true);
        expect(isMybkUsername("khanh.nguyen7")).toBe(true);
        expect(isMybkUsername("nhat.maikumo")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isMybkUsername("Viet.Anh9Q1")).toBe(true);
    });

    it("strips an @domain part before checking", () => {
        expect(isMybkUsername("viet.anh9q1@hcmut.edu.vn")).toBe(true);
        expect(isMybkUsername("kuumoneko@example.com")).toBe(false);
    });

    it("rejects clearly-local usernames", () => {
        expect(isMybkUsername("kuumoneko")).toBe(false);
        expect(isMybkUsername("my_account")).toBe(false);
        expect(isMybkUsername("user name")).toBe(false);
        expect(isMybkUsername("a")).toBe(false);
        expect(isMybkUsername("")).toBe(false);
    });
});

describe("normalizeUsername", () => {
    it("trims and drops @domain", () => {
        expect(normalizeUsername("  kuumoneko@x.com ")).toBe("kuumoneko");
        expect(normalizeUsername("viet.anh9q1")).toBe("viet.anh9q1");
    });
});

describe("local login choice", () => {
    it("is absent by default, stored per username", () => {
        expect(getLocalLoginChoice("kuumoneko")).toBe(false);
        setLocalLoginChoice("kuumoneko");
        expect(getLocalLoginChoice("kuumoneko")).toBe(true);
        expect(getLocalLoginChoice("other")).toBe(false);
    });

    it("keys by normalized username", () => {
        setLocalLoginChoice("  kuumoneko@x.com ");
        expect(getLocalLoginChoice("kuumoneko")).toBe(true);
    });

    it("clears the choice", () => {
        setLocalLoginChoice("kuumoneko");
        clearLocalLoginChoice("kuumoneko");
        expect(getLocalLoginChoice("kuumoneko")).toBe(false);
    });
});
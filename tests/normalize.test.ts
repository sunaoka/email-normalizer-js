import { describe, expect, test, afterEach } from "vitest";

import { Normalizer, normalize, type MxRecord } from "../src/index.js";

afterEach(() => {
  Normalizer.clearCache();
});

class StubNormalizer extends Normalizer {
  public calls = 0;

  public constructor(
    private readonly records: readonly MxRecord[] | null,
    options = {},
  ) {
    super(options);
  }

  protected override resolveMxRecords(): Promise<MxRecord[] | null> {
    this.calls += 1;
    return Promise.resolve(this.records === null ? null : [...this.records]);
  }
}

class ThrowingMxNormalizer extends Normalizer {
  public override mxRecords(): Promise<MxRecord[]> {
    return Promise.reject(new Error("DNS should not be called"));
  }
}

async function assertNormalized(
  address: string,
  normalizedAddress: string,
  mxRecords: readonly MxRecord[],
  mailboxProvider: string,
): Promise<void> {
  const normalizer = new StubNormalizer(mxRecords);
  const result = await normalizer.normalize(address);

  expect(result.address).toBe(address);
  expect(result.normalizedAddress).toBe(normalizedAddress);
  expect(result.mxRecords).toEqual(mxRecords);
  expect(result.mailboxProvider).toBe(mailboxProvider);
}

async function assertSkipDnsProvider(
  domain: string,
  mailboxProvider: string,
): Promise<void> {
  const result = await normalize(`user@${domain}`, { skipDns: true });

  expect(result.mailboxProvider).toBe(mailboxProvider);
  expect(result.mxRecords).toEqual([]);
}

describe("normalize", () => {
  test("throws when the email address is empty", async () => {
    await expect(normalize("")).rejects.toThrow(TypeError);
    await expect(normalize("   ")).rejects.toThrow(
      "emailAddress must not be empty",
    );
    await expect(new Normalizer().normalize("")).rejects.toThrow(
      "emailAddress must not be empty",
    );
  });

  test("returns the original address when MX lookup fails", async () => {
    const address = "user@invalid.invalid";
    const result = await new StubNormalizer(null).normalize(address);

    expect(result.address).toBe(address);
    expect(result.normalizedAddress).toBe(address);
    expect(result.mxRecords).toEqual([]);
    expect(result.mailboxProvider).toBeNull();
  });

  test("Apple", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 10, host: "mx01.mail.icloud.com" }],
      "Apple",
    );
  });

  test("Fastmail plus addressing", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 10, host: "in1-smtp.messagingengine.com" }],
      "Fastmail",
    );
  });

  test("Fastmail local-part-as-hostname", async () => {
    await assertNormalized(
      "testing@user.example.com",
      "user@example.com",
      [{ priority: 10, host: "in1-smtp.messagingengine.com" }],
      "Fastmail",
    );
  });

  test("Fastmail multi-segment TLD without subdomain", async () => {
    await assertNormalized(
      "user@example.co.uk",
      "user@example.co.uk",
      [{ priority: 10, host: "in1-smtp.messagingengine.com" }],
      "Fastmail",
    );
  });

  test("Fastmail multi-segment TLD with subdomain", async () => {
    await assertNormalized(
      "testing@user.example.com.au",
      "user@example.com.au",
      [{ priority: 10, host: "in1-smtp.messagingengine.com" }],
      "Fastmail",
    );
  });

  test("Fastmail complex multi-segment TLD", async () => {
    await assertNormalized(
      "testing@user.mail.example.org.uk",
      "user@mail.example.org.uk",
      [{ priority: 10, host: "in1-smtp.messagingengine.com" }],
      "Fastmail",
    );
  });

  test("Fastmail deep subdomain single TLD", async () => {
    await assertNormalized(
      "testing@user.mail.eu.example.com",
      "user@mail.eu.example.com",
      [{ priority: 10, host: "in1-smtp.messagingengine.com" }],
      "Fastmail",
    );
  });

  test("Google consumer Gmail strips periods", async () => {
    await assertNormalized(
      "u.s.e.r+tag@gmail.com",
      "user@gmail.com",
      [{ priority: 1, host: "aspmx.l.google.com" }],
      "Google",
    );
  });

  test("Google consumer Googlemail strips periods", async () => {
    await assertNormalized(
      "u.s.e.r+tag@googlemail.com",
      "user@googlemail.com",
      [{ priority: 1, host: "aspmx.l.google.com" }],
      "Google",
    );
  });

  test("Google Workspace preserves periods", async () => {
    await assertNormalized(
      "u.s.e.r+tag@example.com",
      "u.s.e.r@example.com",
      [{ priority: 1, host: "aspmx.l.google.com" }],
      "Google",
    );
  });

  test("Microsoft", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 10, host: "domain-com.mail.protection.outlook.com" }],
      "Microsoft",
    );
  });

  test("ProtonMail", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 5, host: "mail.protonmail.ch" }],
      "ProtonMail",
    );
  });

  test("Rackspace", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 10, host: "mx1.emailsrvr.com" }],
      "Rackspace",
    );
  });

  test("Yahoo", async () => {
    await assertNormalized(
      "user-keyword@example.com",
      "user-keyword@example.com",
      [{ priority: 1, host: "mta5.am0.yahoodns.net" }],
      "Yahoo",
    );
  });

  test("Yandex", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 10, host: "mx.yandex.net" }],
      "Yandex",
    );
  });

  test("Zoho", async () => {
    await assertNormalized(
      "user+test@example.com",
      "user@example.com",
      [{ priority: 10, host: "mx.zoho.com" }],
      "Zoho",
    );
  });

  test("static skipDns provider map", async () => {
    await assertSkipDnsProvider("gmail.com", "Google");
    await assertSkipDnsProvider("googlemail.com", "Google");
    await assertSkipDnsProvider("outlook.com", "Microsoft");
    await assertSkipDnsProvider("hotmail.com", "Microsoft");
    await assertSkipDnsProvider("live.com", "Microsoft");
    await assertSkipDnsProvider("msn.com", "Microsoft");
    await assertSkipDnsProvider("icloud.com", "Apple");
    await assertSkipDnsProvider("me.com", "Apple");
    await assertSkipDnsProvider("mac.com", "Apple");
    await assertSkipDnsProvider("fastmail.com", "Fastmail");
    await assertSkipDnsProvider("fastmail.fm", "Fastmail");
    await assertSkipDnsProvider("protonmail.com", "ProtonMail");
    await assertSkipDnsProvider("proton.me", "ProtonMail");
    await assertSkipDnsProvider("pm.me", "ProtonMail");
    await assertSkipDnsProvider("yahoo.com", "Yahoo");
    await assertSkipDnsProvider("yahoo.co.uk", "Yahoo");
    await assertSkipDnsProvider("yahoo.co.jp", "Yahoo");
    await assertSkipDnsProvider("ymail.com", "Yahoo");
    await assertSkipDnsProvider("aol.com", "Yahoo");
    await assertSkipDnsProvider("yandex.com", "Yandex");
    await assertSkipDnsProvider("yandex.ru", "Yandex");
    await assertSkipDnsProvider("ya.ru", "Yandex");
    await assertSkipDnsProvider("zoho.com", "Zoho");
    await assertSkipDnsProvider("zohomail.com", "Zoho");
  });

  test("skipDns applies provider rules", async () => {
    const result = await normalize("u.s.e.r+tag@gmail.com", { skipDns: true });

    expect(result.normalizedAddress).toBe("user@gmail.com");
    expect(result.mailboxProvider).toBe("Google");
  });

  test("skipDns unknown domain", async () => {
    const result = await normalize("user@example.invalid", { skipDns: true });

    expect(result.mailboxProvider).toBeNull();
    expect(result.mxRecords).toEqual([]);
  });

  test("skipDns does not call DNS", async () => {
    const result = await new ThrowingMxNormalizer({ skipDns: true }).normalize(
      "test@gmail.com",
    );

    expect(result.mailboxProvider).toBe("Google");
  });

  test("parses display-name addresses", async () => {
    const result = await normalize("User Name <u.s.e.r+tag@gmail.com>", {
      skipDns: true,
    });

    expect(result.address).toBe("User Name <u.s.e.r+tag@gmail.com>");
    expect(result.normalizedAddress).toBe("user@gmail.com");
  });

  test("sorts MX records and normalizes DNS hostnames", async () => {
    const normalizer = new StubNormalizer([
      { priority: 20, host: "Z.EXAMPLE.COM." },
      { priority: 10, host: "b.example.com" },
      { priority: 10, host: "a.example.com" },
    ]);

    const records = await normalizer.mxRecords("example.com");

    expect(records).toEqual([
      { priority: 10, host: "a.example.com" },
      { priority: 10, host: "b.example.com" },
      { priority: 20, host: "Z.EXAMPLE.COM." },
    ]);
  });

  test("caches successful lookups", async () => {
    const normalizer = new StubNormalizer([
      { priority: 10, host: "mx.example.com" },
    ]);

    await normalizer.mxRecords("example.com");
    await normalizer.mxRecords("example.com");

    expect(normalizer.calls).toBe(1);
  });

  test("caches failed lookups when enabled", async () => {
    const normalizer = new StubNormalizer(null, { cacheFailures: true });

    await normalizer.mxRecords("example.com");
    await normalizer.mxRecords("example.com");

    expect(normalizer.calls).toBe(1);
  });

  test("does not cache failed lookups when disabled", async () => {
    const normalizer = new StubNormalizer(null, { cacheFailures: false });

    await normalizer.mxRecords("example.com");
    await normalizer.mxRecords("example.com");

    expect(normalizer.calls).toBe(2);
  });

  test("prunes the lowest hit and last-access cache entry", async () => {
    const normalizer = new StubNormalizer(
      [{ priority: 10, host: "mx.example.com" }],
      { cacheLimit: 2 },
    );

    await normalizer.mxRecords("first.example");
    await normalizer.mxRecords("first.example");
    await normalizer.mxRecords("second.example");
    await normalizer.mxRecords("third.example");
    await normalizer.mxRecords("second.example");

    expect(normalizer.calls).toBe(4);
  });
});

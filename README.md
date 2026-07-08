# @sunaoka/email-normalizer

`@sunaoka/email-normalizer` is a Node.js port of [`gmr/email-normalize`](https://github.com/gmr/email-normalize).

It normalizes email addresses by applying mailbox provider-specific rules such as plus addressing, Gmail dot handling, and Fastmail subdomain aliases. It can detect providers from MX records through Node.js DNS APIs, or use a static domain map when DNS lookups should be skipped.

## Requirements

- Node.js 22 or later
- pnpm, npm, or yarn

## Installation

This package is not published to npm yet. Install it from a Git tag:

```bash
pnpm add git+https://github.com/sunaoka/email-normalizer-js#0.1.0
```

```bash
npm install git+https://github.com/sunaoka/email-normalizer-js#0.1.0
```

```bash
yarn add git+https://github.com/sunaoka/email-normalizer-js#0.1.0
```

## Usage

```ts
import { normalize } from "@sunaoka/email-normalizer";

const result = await normalize("u.s.e.r+tag@gmail.com");

console.log(result.address); // u.s.e.r+tag@gmail.com
console.log(result.normalizedAddress); // user@gmail.com
console.log(result.mailboxProvider); // Google
```

## Skipping DNS Lookups

Use `skipDns: true` when DNS resolution is not desired. In this mode, the package detects well-known mailbox providers from a static domain map and returns an empty MX record list.

```ts
import { normalize } from "@sunaoka/email-normalizer";

const result = await normalize("user+tag@outlook.com", { skipDns: true });

console.log(result.normalizedAddress); // user@outlook.com
console.log(result.mailboxProvider); // Microsoft
```

## Reusing a Normalizer

Create a `Normalizer` instance when normalizing multiple addresses. The MX cache is shared at the package level and respects the configured cache limit and failure caching options.

```ts
import { Normalizer } from "@sunaoka/email-normalizer";

const normalizer = new Normalizer({
  cacheLimit: 1024,
  cacheFailures: true,
  failureTtl: 300,
});

const result = await normalizer.normalize("name+tag@example.com");
```

## API

```ts
export interface MxRecord {
  priority: number;
  host: string;
}

export interface Result {
  readonly address: string;
  readonly normalizedAddress: string;
  readonly mxRecords: readonly MxRecord[];
  readonly mailboxProvider: string | null;
}

export interface NormalizerOptions {
  cacheLimit?: number;
  cacheFailures?: boolean;
  failureTtl?: number;
  skipDns?: boolean;
}

export function normalize(emailAddress: string, options?: { skipDns?: boolean }): Promise<Result>;

export class Normalizer {
  constructor(options?: NormalizerOptions);
  normalize(emailAddress: string): Promise<Result>;
  mxRecords(domainPart: string): Promise<MxRecord[]>;
  static clearCache(): void;
}
```

## Supported Providers

- Apple
- Fastmail
- Google
- Microsoft
- ProtonMail
- Rackspace
- Yahoo
- Yandex
- Zoho

## Normalization Rules

- Plus addressing providers strip the `+tag` part from the local part.
- Gmail and Googlemail strip periods from the local part.
- Google Workspace custom domains keep periods but strip plus addressing.
- Fastmail can treat the left-most subdomain as the local part.
- Yahoo is detected, but no local-part normalization is applied.

## Development

```bash
pnpm install
pnpm run ci
pnpm run test
```

## License

BSD-3-Clause.

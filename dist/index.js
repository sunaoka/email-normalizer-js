import { promises as dns } from "node:dns";
import { parse } from "tldts";
const Rules = {
    NONE: 0,
    PLUS_ADDRESSING: 1,
    LOCAL_PART_AS_HOSTNAME: 2,
    STRIP_PERIODS: 4,
};
const PROVIDERS = [
    {
        name: "Apple",
        flags: Rules.PLUS_ADDRESSING,
        mxDomains: ["icloud.com"],
    },
    {
        name: "Fastmail",
        flags: Rules.PLUS_ADDRESSING | Rules.LOCAL_PART_AS_HOSTNAME,
        mxDomains: ["messagingengine.com"],
    },
    {
        name: "Google",
        flags: Rules.PLUS_ADDRESSING | Rules.STRIP_PERIODS,
        mxDomains: ["google.com", "googlemail.com"],
        stripPeriodDomains: ["gmail.com", "googlemail.com"],
    },
    {
        name: "Microsoft",
        flags: Rules.PLUS_ADDRESSING,
        mxDomains: ["outlook.com"],
    },
    {
        name: "ProtonMail",
        flags: Rules.PLUS_ADDRESSING,
        mxDomains: ["protonmail.ch"],
    },
    {
        name: "Rackspace",
        flags: Rules.PLUS_ADDRESSING,
        mxDomains: ["emailsrvr.com"],
    },
    {
        name: "Yahoo",
        flags: Rules.NONE,
        mxDomains: ["yahoodns.net"],
    },
    {
        name: "Yandex",
        flags: Rules.PLUS_ADDRESSING,
        mxDomains: ["mx.yandex.net", "yandex.ru"],
    },
    {
        name: "Zoho",
        flags: Rules.PLUS_ADDRESSING,
        mxDomains: ["zoho.com"],
    },
];
const DOMAIN_MAP = new Map([
    ["icloud.com", "Apple"],
    ["me.com", "Apple"],
    ["mac.com", "Apple"],
    ["fastmail.com", "Fastmail"],
    ["fastmail.fm", "Fastmail"],
    ["gmail.com", "Google"],
    ["googlemail.com", "Google"],
    ["outlook.com", "Microsoft"],
    ["hotmail.com", "Microsoft"],
    ["live.com", "Microsoft"],
    ["msn.com", "Microsoft"],
    ["proton.me", "ProtonMail"],
    ["protonmail.com", "ProtonMail"],
    ["pm.me", "ProtonMail"],
    ["yahoo.com", "Yahoo"],
    ["yahoo.co.uk", "Yahoo"],
    ["yahoo.co.jp", "Yahoo"],
    ["ymail.com", "Yahoo"],
    ["aol.com", "Yahoo"],
    ["yandex.com", "Yandex"],
    ["yandex.ru", "Yandex"],
    ["ya.ru", "Yandex"],
    ["zoho.com", "Zoho"],
    ["zohomail.com", "Zoho"],
].map(([domain, providerName]) => {
    const provider = PROVIDERS.find((candidate) => candidate.name === providerName);
    if (provider === undefined) {
        throw new Error(`Unknown provider: ${providerName}`);
    }
    return [domain, provider];
}));
const cache = new Map();
export async function normalize(emailAddress, options = {}) {
    return new Normalizer(options).normalize(emailAddress);
}
export class Normalizer {
    cacheLimit;
    cacheFailures;
    failureTtl;
    skipDns;
    constructor(options = {}) {
        this.cacheLimit = options.cacheLimit ?? 1024;
        this.cacheFailures = options.cacheFailures ?? true;
        this.failureTtl = options.failureTtl ?? 300;
        this.skipDns = options.skipDns ?? false;
    }
    async normalize(emailAddress) {
        const address = this.parseAddress(emailAddress);
        const atIndex = address.indexOf("@");
        if (atIndex < 0) {
            return {
                address: emailAddress,
                normalizedAddress: address.toLowerCase(),
                mxRecords: [],
                mailboxProvider: null,
            };
        }
        let localPart = address.slice(0, atIndex).toLowerCase();
        let domainPart = address.slice(atIndex + 1).toLowerCase();
        const mxRecords = this.skipDns ? [] : await this.mxRecords(domainPart);
        const provider = this.skipDns
            ? this.lookupProviderByDomain(domainPart)
            : this.lookupProvider(mxRecords);
        if (provider !== null) {
            if ((provider.flags & Rules.LOCAL_PART_AS_HOSTNAME) !== 0) {
                [localPart, domainPart] = this.localPartAsHostname(localPart, domainPart);
            }
            if ((provider.flags & Rules.STRIP_PERIODS) !== 0 &&
                this.shouldStripPeriods(provider, domainPart)) {
                localPart = localPart.replaceAll(".", "");
            }
            if ((provider.flags & Rules.PLUS_ADDRESSING) !== 0) {
                localPart = localPart.split("+", 1)[0] ?? "";
            }
        }
        return {
            address: emailAddress,
            normalizedAddress: `${localPart}@${domainPart}`,
            mxRecords,
            mailboxProvider: provider?.name ?? null,
        };
    }
    async mxRecords(domainPart) {
        if (this.skipDns) {
            return [];
        }
        if (this.shouldResolve(domainPart)) {
            const records = await this.resolveMxRecords(domainPart);
            let mxRecords;
            let ttl;
            if (records === null) {
                if (!this.cacheFailures) {
                    return [];
                }
                mxRecords = [];
                ttl = this.failureTtl;
            }
            else {
                mxRecords = this.sortMxRecords(records);
                ttl = this.failureTtl;
            }
            if (cache.size >= this.cacheLimit) {
                this.pruneCache();
            }
            cache.set(domainPart, {
                cachedAt: Date.now(),
                hits: 0,
                lastAccess: Date.now(),
                mxRecords,
                ttl,
            });
        }
        const item = cache.get(domainPart);
        if (item === undefined) {
            return [];
        }
        item.hits += 1;
        item.lastAccess = Date.now();
        return item.mxRecords.map((record) => ({
            priority: record.priority,
            host: record.host,
        }));
    }
    static clearCache() {
        cache.clear();
    }
    async resolveMxRecords(domainPart) {
        try {
            const records = await dns.resolveMx(domainPart);
            if (records.length === 0) {
                return null;
            }
            return this.sortMxRecords(records.map((record) => ({
                priority: record.priority,
                host: record.exchange.toLowerCase().replace(/\.$/, ""),
            })));
        }
        catch {
            return null;
        }
    }
    parseAddress(emailAddress) {
        const match = /<([^<>]+)>/.exec(emailAddress);
        return match?.[1] ?? emailAddress.trim();
    }
    localPartAsHostname(localPart, domainPart) {
        const parsed = parse(domainPart);
        if (parsed.domain === null ||
            parsed.domain === domainPart ||
            parsed.subdomain === null ||
            parsed.subdomain === "") {
            return [localPart, domainPart];
        }
        const subdomainParts = parsed.subdomain.split(".");
        const nextLocalPart = subdomainParts.shift();
        if (nextLocalPart === undefined || nextLocalPart === "") {
            return [localPart, domainPart];
        }
        const remaining = subdomainParts.join(".");
        return [
            nextLocalPart,
            remaining === "" ? parsed.domain : `${remaining}.${parsed.domain}`,
        ];
    }
    shouldStripPeriods(provider, domainPart) {
        const stripPeriodDomains = provider.stripPeriodDomains ?? [];
        return (stripPeriodDomains.length === 0 || stripPeriodDomains.includes(domainPart));
    }
    lookupProviderByDomain(domainPart) {
        return DOMAIN_MAP.get(domainPart) ?? null;
    }
    lookupProvider(mxRecords) {
        for (const record of mxRecords) {
            const host = record.host.toLowerCase();
            for (const provider of PROVIDERS) {
                for (const domain of provider.mxDomains) {
                    if (host.endsWith(domain)) {
                        return provider;
                    }
                }
            }
        }
        return null;
    }
    shouldResolve(domainPart) {
        const item = cache.get(domainPart);
        if (item === undefined) {
            return true;
        }
        if (Date.now() - item.cachedAt > item.ttl * 1000) {
            cache.delete(domainPart);
            return true;
        }
        return false;
    }
    pruneCache() {
        let keyToPrune = null;
        let itemToPrune = null;
        for (const [key, item] of cache) {
            if (itemToPrune === null ||
                item.hits < itemToPrune.hits ||
                (item.hits === itemToPrune.hits &&
                    item.lastAccess < itemToPrune.lastAccess)) {
                keyToPrune = key;
                itemToPrune = item;
            }
        }
        if (keyToPrune !== null) {
            cache.delete(keyToPrune);
        }
    }
    sortMxRecords(records) {
        return [...records].sort((left, right) => left.priority - right.priority || left.host.localeCompare(right.host));
    }
}
//# sourceMappingURL=index.js.map
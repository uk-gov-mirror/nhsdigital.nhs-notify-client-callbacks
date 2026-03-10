export const CHANNEL_TYPES = ["NHSAPP", "EMAIL", "SMS", "LETTER"] as const;

export type Channel = (typeof CHANNEL_TYPES)[number];

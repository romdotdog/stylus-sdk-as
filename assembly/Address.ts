export class Address {
    static get Zero(): Address {
        return new Address(0, 0, 0);
    }

    constructor(public lo1: u64, public lo2: u64, public hi1: u32) {}

    // involution
    switchEndian(): void {
        // lo1[0-31] lo1[32-63] lo2[0-31] lo2[32-63] hi1[0-31]
        // hi1[0-31] lo2[32-63] lo2[0-31] lo1[32-63] lo1[0-31]

        const lo1 = bswap<u64>(this.lo1);
        const lo2 = bswap<u64>(this.lo2);
        const hi1 = bswap<u32>(this.hi1);

        this.lo1 = (hi1 as u64) | (lo2 << 32);
        this.lo2 = (lo2 as u32 as u64) | (lo1 << 32);
        this.hi1 = (lo1 >> 32) as u32;
    }

    isZero(): bool {
        return this.lo1 == 0 && this.lo2 == 0 && this.hi1 == 0;
    }
}

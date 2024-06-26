import { Class, DiagnosticCode, Program, Range, Statement, Type, Element } from "assemblyscript/dist/assemblyscript.js";
import { TypeVisitor } from "./TypeVisitor.js";
import { SimpleParser } from "./SimpleParser.js";
import { isPropertyPrototype } from "./util.js";
import { DynamicChecker } from "./DynamicChecker.js";

export class Deserializer extends TypeVisitor<string, void> {
    private dynamicStack: (() => void)[] = [];

    constructor(
        program: Program,
        public range: Range,
        private offset: number = 0,
        public ctx: Element,
        public stmts: Statement[] = [],
        private dynamicSize: string[] = []
    ) {
        super(program);
    }

    get size(): string {
        return `${this.offset}${this.dynamicSize.map(x => ` + ${x}`).join("")}`; // add all the dynamic sizes
    }

    visitDynamic(): void {
        for (const item of this.dynamicStack) {
            item();
        }
    }

    visitU256(_type: Type, dst: string): void {
        const classInstance = `_u256_${this.offset}`;
        this.stmts.push(
            SimpleParser.parseStatement(`const ${classInstance} = u256.Zero;`, this.range),
            SimpleParser.parseStatement(
                `${classInstance}.hi2 = bswap<u64>(i64.load(inputPtr, ${this.offset}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.hi1 = bswap<u64>(i64.load(inputPtr, ${this.offset + 8}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.lo2 = bswap<u64>(i64.load(inputPtr, ${this.offset + 16}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.lo1 = bswap<u64>(i64.load(inputPtr, ${this.offset + 24}));`,
                this.range
            ),
            SimpleParser.parseStatement(`${dst} = ${classInstance}`, this.range)
        );
        this.offset += 32;
    }

    visitAddress(type: Type, dst: string): void {
        const classInstance = `_address_${this.offset}`;
        this.stmts.push(
            SimpleParser.parseStatement(
                `const ${classInstance} = new Address(
                bswap<u64>(i64.load(inputPtr, ${this.offset + 24})),
                bswap<u64>(i64.load(inputPtr, ${this.offset + 16})),
                bswap<u32>(i32.load(inputPtr, ${this.offset + 12}))
            );`,
                this.range
            ),
            SimpleParser.parseStatement(`${dst} = ${classInstance}`, this.range)
        );
        this.offset += 32;
    }

    visitStruct(_type: Type, _class: Class, dst: string): void {
        if (_class.prototype.constructorPrototype) {
            this.program.error(
                DiagnosticCode.Transform_0_1,
                this.range,
                "stylus-sdk-as",
                "Cannot deserialize types with custom constructors"
            );
            return;
        }

        const dynamic = new DynamicChecker(this.program).visitStruct(_type, _class);

        if (dynamic) {
            this.dynamicStack.push(() => this.decodeStruct(_type, _class, dst));
            this.offset += 32;
        } else {
            this.decodeStruct(_type, _class, dst);
        }
    }

    decodeStruct(_type: Type, _class: Class, dst: string): void {
        const deserializer = new Deserializer(
            this.program,
            this.range,
            this.offset,
            this.ctx,
            this.stmts,
            this.dynamicSize
        );

        // add it to the scope
        const mangledName = `${_class.name}_${(Math.random() * 10000000) | 0}`;
        this.ctx.add(mangledName, _class.prototype);

        const classInstance = `_${_class.name}_${this.offset}`;
        this.stmts.push(
            SimpleParser.parseStatement(
                `const ${classInstance} = changetype<${mangledName}>(__new(${_class.nextMemoryOffset}, ${_class.id}));`,
                this.range
            )
        );
        for (const [name, member] of _class.members!.entries()) {
            if (isPropertyPrototype(member)) {
                const prop = member.instance;
                if (prop === null) {
                    // bad, property error
                    return this.error();
                }
                deserializer.visit(prop.type, `${classInstance}.${name}`);
            }
        }

        deserializer.visitDynamic();
        this.offset = deserializer.offset;

        this.stmts.push(SimpleParser.parseStatement(`${dst} = ${classInstance}`, this.range));
    }

    visitFunction(_type: Type): void {
        return this.error();
    }

    visitBool(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = <bool>i32.load8_u(inputPtr, ${this.offset + 31});`, this.range)
        );
        this.offset += 32;
    }

    visitI8(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = <i8>i32.load8_s(inputPtr, ${this.offset + 31});`, this.range)
        );
        this.offset += 32;
    }

    visitU8(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = <u8>i32.load8_u(inputPtr, ${this.offset + 31});`, this.range)
        );
        this.offset += 32;
    }

    visitI16(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<i16>(<i16>i32.load16_s(inputPtr, ${this.offset + 30}));`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitU16(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<u16>(<u16>i32.load16_u(inputPtr, ${this.offset + 30}));`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitI32(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<i32>(i32.load(inputPtr, ${this.offset + 28}));`, this.range)
        );
        this.offset += 32;
    }

    visitU32(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<u32>(i32.load(inputPtr, ${this.offset + 28}));`, this.range)
        );
        this.offset += 32;
    }

    visitI64(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<i64>(i64.load(inputPtr, ${this.offset + 24}));`, this.range)
        );
        this.offset += 32;
    }

    visitU64(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<u64>(i64.load(inputPtr, ${this.offset + 24}));`, this.range)
        );
        this.offset += 32;
    }

    visitIsize(type: Type, dst: string): void {
        let sizeType = this.program.options.isWasm64 ? "i64" : "i32";
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<isize>(${sizeType}.load(inputPtr, ${this.offset + 32 - type.byteSize}) as isize);`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitUsize(type: Type, dst: string): void {
        let sizeType = this.program.options.isWasm64 ? "i64" : "i32";
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<usize>(${sizeType}.load(inputPtr, ${this.offset + 32 - type.byteSize}) as usize);`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitString(type: Type, dst: string): void {
        this.dynamicStack.push(() => this.decodeString(type, dst));
        this.offset += 32;
    }

    decodeString(type: Type, dst: string): void {
        const len = `length_${this.offset}`;
        this.visitUsize(type, `let ${len}`);
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = String.UTF8.decodeUnsafe(inputPtr + ${this.offset}, ${len}, false);`,
                this.range
            ),
            SimpleParser.parseStatement(`${len} = align32(${len});`, this.range), // align to 32 because of padding
            SimpleParser.parseStatement(`inputPtr += ${len};`, this.range) // offset skips the dynamic length
        );
        this.dynamicSize.push(len);
    }

    error(): void {
        this.program.error(DiagnosticCode.Transform_0_1, this.range, "stylus-sdk-as", "Cannot deserialize type");
    }
}

import {
    ASTBuilder,
    ClassDeclaration,
    DiagnosticCode,
    FieldDeclaration,
    Parser,
    Program,
    PropertyPrototype,
    ReportMode,
    Type
} from "assemblyscript/dist/assemblyscript.js";
import {
    isBlock,
    isClassPrototype,
    isFieldDeclaration,
    isFunctionPrototype,
    isNamedTypeNode,
    isPropertyPrototype
} from "./util.js";
import { SimpleParser } from "./SimpleParser.js";
import { id } from "ethers";
import { ABI } from "./ABI.js";
import { Serializer } from "./Serializer.js";

export class EventTransform {
    private events: Set<ClassDeclaration> = new Set();
    private indexed: Set<FieldDeclaration> = new Set();

    constructor(private program: Program, private abi: string[]) {}

    add(parser: Parser, event: ClassDeclaration) {
        const members = event.members;
        let indexedCount = 0; // counter for the number of Indexed<T> fields, since we can't have more than 3

        for (const member of members) {
            // check if the current member is a field declaration with an 'Indexed' type
            if (
                isFieldDeclaration(member) &&
                member.type &&
                isNamedTypeNode(member.type) &&
                member.type.name.identifier.text === "Indexed"
            ) {
                // check that it has exactly one type parameter
                if (member.type.typeArguments === null || member.type.typeArguments.length > 1) {
                    parser.error(
                        DiagnosticCode.Transform_0_1,
                        member.range,
                        "stylus-sdk-as",
                        "`Indexed` must have exactly one type parameter."
                    );
                    continue;
                }

                // replace the Indexed<T> with its single type argument T
                member.type = member.type.typeArguments[0];

                if (indexedCount === 3) {
                    parser.error(
                        DiagnosticCode.Transform_0_1,
                        member.range,
                        "stylus-sdk-as",
                        "Cannot have more than 3 `Indexed` fields."
                    );
                    continue;
                }

                this.indexed.add(member);
                indexedCount += 1;
            }
        }

        // add a serialize function whose body will be generated later
        members.push(SimpleParser.parseClassMember(`serialize(): StaticArray<u8> {}`, event));

        this.events.add(event);
    }

    private fillSerializeImpl(event: ClassDeclaration) {
        const proto = this.program.elementsByDeclaration.get(event);
        if (proto === undefined || !isClassPrototype(proto) || proto.instanceMembers === null) return;

        const serialize = proto.instanceMembers.get("serialize");

        if (
            serialize === undefined ||
            !isFunctionPrototype(serialize) ||
            serialize.bodyNode === null ||
            !isBlock(serialize.bodyNode)
        )
            throw new Error("Event serialize not found");

        const abi = new ABI(this.program, event.range);
        let hrABIParams = [];

        const serializer = new Serializer(this.program, event.range, 33, []);

        let topicCount = 1;
        let signature = proto.name + "(";
        const instanceMembers = [...proto.instanceMembers.values()];
        let nonIndexed: [PropertyPrototype, Type][] = [];
        for (let i = 0; i < instanceMembers.length; ++i) {
            const member = instanceMembers[i];
            if (isPropertyPrototype(member) && member.fieldDeclaration) {
                if (i > 0) signature += ",";
                if (member.typeNode === null) {
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.declaration.range,
                        "stylus-sdk-as",
                        "Type must be specified"
                    );
                    continue;
                }
                const type = this.program.resolver.resolveType(member.typeNode, null, member, null, ReportMode.Swallow);
                if (type === null) {
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.declaration.range,
                        "stylus-sdk-as",
                        "Cannot serialize type"
                    );
                    continue;
                }
                const serNotSpaced = abi.visit(type, false);
                const serSpaced = abi.visit(type, true);
                if (serNotSpaced === null || serSpaced === null) {
                    // TODO: only do this once
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.declaration.range,
                        "stylus-sdk-as",
                        "Cannot serialize type"
                    );
                    continue;
                }
                signature += serNotSpaced;
                if (this.indexed.has(member.fieldDeclaration)) {
                    hrABIParams.push(`${serSpaced} indexed ${member.name}`);
                    serializer.visit(type, "this." + member.name);
                    topicCount += 1;
                } else {
                    hrABIParams.push(`${serSpaced} ${member.name}`);
                    nonIndexed.push([member, type]);
                }
            }
        }

        for (const [property, type] of nonIndexed) {
            serializer.visit(type, "this." + property.name);
        }

        signature += ")";
        if (signature === null) return;
        const topic0 = id(signature).slice(2);

        function bswap(hex: string): string {
            const bytes = hex.match(/.{2}/g);
            return bytes!.reverse().join("");
        }

        serialize.bodyNode.statements.push(
            SimpleParser.parseStatement(`const arr = new StaticArray<u8>(${serializer.offset})`, event.range),
            SimpleParser.parseStatement(`const ptr = changetype<usize>(arr);`, event.range),
            SimpleParser.parseStatement(`i32.store8(ptr, ${topicCount}, 0);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(0, 16))}, 1);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(16, 32))}, 9);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(32, 48))}, 17);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(48, 64))}, 25);`, event.range),
            ...serializer.stmts,
            SimpleParser.parseStatement(`return arr;`, event.range)
        );

        const builder = new ASTBuilder();
        builder.visitBlockStatement(serialize.bodyNode);
        //console.log(builder.finish());

        this.abi.push(`event ${proto.name}(${hrABIParams.join(", ")})`);
    }

    fillSerializeImpls(): void {
        for (const event of this.events) {
            this.fillSerializeImpl(event);
        }
    }
}

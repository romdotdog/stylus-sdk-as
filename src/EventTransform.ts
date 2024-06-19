import {
    ASTBuilder,
    ClassDeclaration,
    ClassPrototype,
    DiagnosticCode,
    FunctionPrototype,
    MethodDeclaration,
    Program,
    PropertyPrototype,
    ReportMode,
    Type
} from "assemblyscript/dist/assemblyscript.js";
import {
    isBlock,
    isFieldDeclaration,
    isNamedTypeNode,
    isPropertyPrototype
} from "./util.js";
import { SimpleParser } from "./SimpleParser.js";
import { id } from "ethers";
import { ABI } from "./ABI.js";
import { Serializer } from "./Serializer.js";

export class EventTransform {
    constructor(private program: Program, private abi: string[]) {}

    fillSerializeImpl(event: ClassPrototype) {
        if (event.instanceMembers === null) return;

        const eventDecl = <ClassDeclaration>event.declaration;
        const serializeDecl = <MethodDeclaration>SimpleParser.parseClassMember(`serialize(): StaticArray<u8> {}`, eventDecl);
        
        // add to class
        event.addInstance("serialize", new FunctionPrototype("serialize", event, serializeDecl));

        if (
            serializeDecl.body === null ||
            !isBlock(serializeDecl.body)
        )
            throw new Error();

        const range = eventDecl.name.range;
        const abi = new ABI(this.program, range);
        let hrABIParams = [];

        const serializer = new Serializer(this.program, range, 33, []);

        let topicCount = 1;
        let signature = event.name + "(";
        const instanceMembers = [...event.instanceMembers.values()];
        let nonIndexed: [PropertyPrototype, Type][] = [];
        
        const members = eventDecl.members;
        let indexedCount = 0; // counter for the number of Indexed<T> fields, since we can't have more than 3

        for (const member of members) {
            let isIndexed = false;

            // check if the current member is a field declaration
            if (
                !isFieldDeclaration(member) ||
                member.type === null
            ) continue;

            // if its type matches Indexed<T>
            if (isNamedTypeNode(member.type) && member.type.name.identifier.text === "Indexed") {
                // check that it has exactly one type parameter
                if (member.type.typeArguments === null || member.type.typeArguments.length > 1) {
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.range,
                        "stylus-sdk-as",
                        "`Indexed` must have exactly one type parameter."
                    );
                    continue;
                }

                isIndexed = true;

                if (indexedCount === 3) {
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.range,
                        "stylus-sdk-as",
                        "Cannot have more than 3 `Indexed` fields."
                    );
                    continue;
                }

                indexedCount += 1;
            }

            const prop = instanceMembers.find(e => (e as any).fieldDeclaration === member);
            if (prop === undefined || !isPropertyPrototype(prop) || prop.fieldDeclaration === null) throw new Error();

            if (indexedCount > 1) signature += ",";
            if (prop.typeNode === null) {
                this.program.error(
                    DiagnosticCode.Transform_0_1,
                    prop.declaration.range,
                    "stylus-sdk-as",
                    "Type must be specified"
                );
                continue;
            }
            const type = this.program.resolver.resolveType(prop.typeNode, null, prop, null, ReportMode.Swallow);
            if (type === null) {
                this.program.error(
                    DiagnosticCode.Transform_0_1,
                    prop.declaration.range,
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
                    prop.declaration.range,
                    "stylus-sdk-as",
                    "Cannot serialize type"
                );
                continue;
            }
            signature += serNotSpaced;
            if (isIndexed) {
                hrABIParams.push(`${serSpaced} indexed ${prop.name}`);
                serializer.visit(type, "this." + prop.name);
                topicCount += 1;
            } else {
                hrABIParams.push(`${serSpaced} ${prop.name}`);
                nonIndexed.push([prop, type]);
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

        serializeDecl.body.statements.push(
            SimpleParser.parseStatement(`const arr = new StaticArray<u8>(${serializer.offset})`, range),
            SimpleParser.parseStatement(`const ptr = changetype<usize>(arr);`, range),
            SimpleParser.parseStatement(`i32.store8(ptr, ${topicCount}, 0);`, range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(0, 16))}, 1);`, range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(16, 32))}, 9);`, range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(32, 48))}, 17);`, range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(48, 64))}, 25);`, range),
            ...serializer.stmts,
            SimpleParser.parseStatement(`return arr;`, range)
        );

        const builder = new ASTBuilder();
        builder.visitBlockStatement(serializeDecl.body);
        console.log(builder.finish());

        this.abi.push(`event ${event.name}(${hrABIParams.join(", ")})`);
    }
}

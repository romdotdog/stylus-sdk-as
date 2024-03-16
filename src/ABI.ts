import {
    Class,
    FunctionPrototype,
    Type,
    DiagnosticCode,
    ReportMode,
    TypeKind
} from "assemblyscript/dist/assemblyscript.js";
import { TypeVisitor } from "./TypeVisitor.js";
import { isPropertyPrototype } from "./guards.js";

export class ABI extends TypeVisitor<boolean, string | null> {
    // TODO: cover solidity reserved words
    functionSelector(method: FunctionPrototype): string | null {
        let res = method.name + "(";
        for (let i = 0; i < method.functionTypeNode.parameters.length; ++i) {
            if (i > 0) res += ", ";
            const param = method.functionTypeNode.parameters[i];
            const type = this.program.resolver.resolveType(param.type, null, method, null, ReportMode.Swallow);
            if (type === null) {
                this.program.error(DiagnosticCode.Transform_0_1, param.range, "stylus-sdk-as", "Cannot serialize type");
                return null;
            }
            const ser = this.visit(type, false);
            if (ser === null) {
                this.program.error(DiagnosticCode.Transform_0_1, param.range, "stylus-sdk-as", "Cannot serialize type");
                return null;
            }
            res += ser;
        }
        res += ")";
        return res;
    }

    hrABI(method: FunctionPrototype): string | null {
        let res = `function ${method.name}(`;
        for (let i = 0; i < method.functionTypeNode.parameters.length; ++i) {
            if (i > 0) res += ", ";
            const param = method.functionTypeNode.parameters[i];
            const type = this.program.resolver.resolveType(param.type, null, method, null, ReportMode.Swallow);
            if (type === null) {
                this.program.error(DiagnosticCode.Transform_0_1, param.range, "stylus-sdk-as", "Cannot serialize type");
                return null;
            }
            const ser = this.visit(type, true);
            if (ser === null) {
                this.program.error(DiagnosticCode.Transform_0_1, param.range, "stylus-sdk-as", "Cannot serialize type");
                return null;
            }
            res += `${ser} ${param.name.text}`;
        }
        res += ")";
        const returnTypeNode = method.functionTypeNode.returnType;
        const returnType = this.program.resolver.resolveType(returnTypeNode, null, method, null, ReportMode.Swallow);

        if (returnType === null) {
            this.program.error(
                DiagnosticCode.Transform_0_1,
                returnTypeNode.range,
                "stylus-sdk-as",
                "Cannot serialize type"
            );
            return null;
        }

        if (returnType.kind !== TypeKind.Void) {
            const ser = this.visit(returnType, true);
            if (ser === null) {
                this.program.error(
                    DiagnosticCode.Transform_0_1,
                    returnTypeNode.range,
                    "stylus-sdk-as",
                    "Cannot serialize type"
                );
                return null;
            }

            res += ` view returns (${ser})`;
        }

        return res;
    }

    visitU256(_type: Type): string | null {
        return "uint256";
    }

    visitAddress(_type: Type): string | null {
        return "address";
    }

    visitStruct(_type: Type, _class: Class, spaced: boolean): string | null {
        let list = [];
        for (const [name, member] of _class.members!.entries()) {
            if (isPropertyPrototype(member)) {
                const prop = member.instance;
                if (prop === null) {
                    // bad, property error
                    return this.error();
                }

                const ser = this.visit(prop.type, spaced);
                if (ser === null) {
                    return this.error();
                }

                if (spaced) {
                    list.push(ser + " " + name);
                } else {
                    list.push(ser);
                }
            }
        }

        return "(" + list.join(spaced ? ", " : ",") + ")";
    }

    visitFunction(_type: Type): string | null {
        return this.error();
    }

    visitBool(_type: Type): string | null {
        return "bool";
    }

    visitI8(_type: Type): string | null {
        return "int8";
    }

    visitU8(_type: Type): string | null {
        return "uint8";
    }

    visitI16(_type: Type): string | null {
        return "int16";
    }

    visitU16(_type: Type): string | null {
        return "uint16";
    }

    visitI32(_type: Type): string | null {
        return "int32";
    }

    visitU32(_type: Type): string | null {
        return "uint32";
    }

    visitI64(_type: Type): string | null {
        return "int64";
    }

    visitU64(_type: Type): string | null {
        return "uint64";
    }

    visitIsize(_type: Type): string | null {
        if (this.program.options.isWasm64) {
            return "int64";
        } else {
            return "int32";
        }
    }

    visitUsize(_type: Type): string | null {
        if (this.program.options.isWasm64) {
            return "uint64";
        } else {
            return "uint32";
        }
    }

    visitF32(_type: Type): string | null {
        return this.error();
    }

    visitF64(_type: Type): string | null {
        return this.error();
    }

    // TODO: fix the range here
    error(): string | null {
        this.program.error(DiagnosticCode.Transform_0_1, this.range, "stylus-sdk-as", "Cannot serialize type");
        return null;
    }
}

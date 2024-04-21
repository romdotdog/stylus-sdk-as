import { Class, CommonNames, Program, Range, Type, TypeKind } from "assemblyscript/dist/assemblyscript.js";

export abstract class TypeVisitor<A, R> {
    constructor(public program: Program) {}

    visit(type: Type, a: A): R {
        if (type.isValue) {
            return this.visitValue(type, a);
        } else if (type.isReference) {
            return this.visitReference(type, a);
        }
        return this.error();
    }

    visitValue(type: Type, a: A): R {
        switch (type.kind) {
            case TypeKind.Bool:
                return this.visitBool(type, a);
            case TypeKind.I8:
                return this.visitI8(type, a);
            case TypeKind.U8:
                return this.visitU8(type, a);
            case TypeKind.I16:
                return this.visitI16(type, a);
            case TypeKind.U16:
                return this.visitU16(type, a);
            case TypeKind.I32:
                return this.visitI32(type, a);
            case TypeKind.U32:
                return this.visitU32(type, a);
            case TypeKind.I64:
                return this.visitI64(type, a);
            case TypeKind.U64:
                return this.visitU64(type, a);
            case TypeKind.Isize:
                return this.visitIsize(type, a);
            case TypeKind.Usize:
                return this.visitUsize(type, a);
        }
        return this.error();
    }

    visitReference(type: Type, a: A): R {
        if (type.isClass) {
            return this.visitClass(type, a);
        } else if (type.isFunction) {
            return this.visitFunction(type, a);
        }
        return this.error();
    }

    visitClass(type: Type, a: A): R {
        const _class = type.getClass();
        if (_class === this.program.stringInstance) {
            return this.visitString(type, a);
        }
        if (_class !== null && _class.members !== null) {
            if (_class.name === "u256") {
                return this.visitU256(type, a);
            } else if (_class.name === "Address") {
                return this.visitAddress(type, a);
            }

            const hasPointers = _class.members.has(CommonNames.visit);

            if (!hasPointers) {
                return this.visitStruct(type, _class, a);
            }
        }
        return this.error();
    }

    abstract visitU256(type: Type, a: A): R;
    abstract visitAddress(type: Type, a: A): R;
    abstract visitStruct(type: Type, _class: Class, a: A): R;
    abstract visitFunction(type: Type, a: A): R;
    abstract visitBool(type: Type, a: A): R;
    abstract visitI8(type: Type, a: A): R;
    abstract visitU8(type: Type, a: A): R;
    abstract visitI16(type: Type, a: A): R;
    abstract visitU16(type: Type, a: A): R;
    abstract visitI32(type: Type, a: A): R;
    abstract visitU32(type: Type, a: A): R;
    abstract visitI64(type: Type, a: A): R;
    abstract visitU64(type: Type, a: A): R;
    abstract visitIsize(type: Type, a: A): R;
    abstract visitUsize(type: Type, a: A): R;
    abstract visitString(type: Type, a: A): R;
    abstract error(): R;
}

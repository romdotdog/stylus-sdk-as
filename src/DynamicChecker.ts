import { Class, Program, Type } from "assemblyscript/dist/assemblyscript.js";
import { TypeVisitor } from "./TypeVisitor.js";
import { isPropertyPrototype } from "./util.js";

export class DynamicChecker extends TypeVisitor<void, boolean> {
    constructor(public program: Program) {
        super(program);
    }

    visitStruct(type: Type, _class: Class): boolean {
        for (const member of _class.members!.values()) {
            if (isPropertyPrototype(member)) {
                if (this.visit(member.instance!.type)) return true;
            }
        }
        return false;
    }

    visitU256 = (type: Type): boolean => false;
    visitAddress = (type: Type): boolean => false;
    visitFunction = (type: Type): boolean => false;
    visitBool = (type: Type): boolean => false;
    visitI8 = (type: Type): boolean => false;
    visitU8 = (type: Type): boolean => false;
    visitI16 = (type: Type): boolean => false;
    visitU16 = (type: Type): boolean => false;
    visitI32 = (type: Type): boolean => false;
    visitU32 = (type: Type): boolean => false;
    visitI64 = (type: Type): boolean => false;
    visitU64 = (type: Type): boolean => false;
    visitIsize = (type: Type): boolean => false;
    visitUsize = (type: Type): boolean => false;

    visitString = (type: Type): boolean => true;

    error(): boolean {
        return false;
    }
}

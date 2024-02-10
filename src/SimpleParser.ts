import {
    Parser,
    Tokenizer,
    Source,
    SourceKind,
    Expression,
    Statement,
    NamespaceDeclaration,
    ClassDeclaration,
    DeclarationStatement,
    Range
} from "assemblyscript/dist/assemblyscript.js";

export class SimpleParser {
    private static get parser(): Parser {
        return new Parser();
    }

    private static getTokenizer(s: string, file: string): Tokenizer {
        return new Tokenizer(new Source(SourceKind.User, file, s));
    }

    static parseExpression(s: string, rangeFile: Range): Expression {
        const res = this.parser.parseExpression(this.getTokenizer(s, rangeFile.source.normalizedPath));
        if (res == null) {
            throw new Error("Failed to parse the expression: '" + s + "'");
        }
        return res;
    }

    static parseStatement(s: string, rangeFile: Range, topLevel = false): Statement {
        const res = this.parser.parseStatement(this.getTokenizer(s, rangeFile.source.normalizedPath), topLevel);
        if (res == null) {
            throw new Error("Failed to parse the statement: '" + s + "'");
        }
        return res;
    }

    static parseTopLevelStatement(s: string, rangeFile: Range, namespace?: NamespaceDeclaration | null): Statement {
        const res = this.parser.parseTopLevelStatement(
            this.getTokenizer(s, rangeFile.source.normalizedPath),
            namespace
        );
        if (res == null) {
            throw new Error("Failed to parse the top level statement: '" + s + "'");
        }
        return res;
    }

    static parseClassMember(s: string, _class: ClassDeclaration): DeclarationStatement {
        let res = this.parser.parseClassMember(this.getTokenizer(s, _class.range.source.normalizedPath), _class);
        if (res == null) {
            throw new Error("Failed to parse the class member: '" + s + "'");
        }
        return <DeclarationStatement>res;
    }
}

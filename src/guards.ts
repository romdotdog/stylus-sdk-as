import {
    DeclaredElement,
    ClassPrototype,
    ElementKind,
    Statement,
    ClassDeclaration,
    NodeKind,
    MethodDeclaration,
    FieldDeclaration,
    FunctionPrototype,
    PropertyPrototype,
    FunctionDeclaration,
    BlockStatement,
    Expression,
    IdentifierExpression,
    TypeName
} from "assemblyscript";

export function isClassPrototype(elem: DeclaredElement): elem is ClassPrototype {
    return elem.kind === ElementKind.ClassPrototype;
}

export function isClassDeclaration(stmt: Statement): stmt is ClassDeclaration {
    return stmt.kind === NodeKind.ClassDeclaration;
}

export function isMethodDeclaration(stmt: Statement): stmt is MethodDeclaration {
    return stmt.kind === NodeKind.MethodDeclaration;
}

export function isFieldDeclaration(stmt: Statement): stmt is FieldDeclaration {
    return stmt.kind === NodeKind.FieldDeclaration;
}

export function isFunctionPrototype(elem: DeclaredElement): elem is FunctionPrototype {
    return elem.kind === ElementKind.FunctionPrototype;
}

export function isPropertyPrototype(elem: DeclaredElement): elem is PropertyPrototype {
    return elem.kind === ElementKind.PropertyPrototype;
}

export function isFunctionDeclaration(stmt: Statement): stmt is FunctionDeclaration {
    return stmt.kind === NodeKind.FunctionDeclaration;
}

export function isBlock(stmt: Statement): stmt is BlockStatement {
    return stmt.kind === NodeKind.Block;
}

export function isIdentifier(expr: Expression): expr is IdentifierExpression {
    return expr.kind === NodeKind.Identifier;
}

export function isTypeName(expr: Expression): expr is TypeName {
    return expr.kind === NodeKind.TypeName;
}

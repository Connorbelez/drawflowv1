import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import ts from "typescript";

import {
  BIGINT_SUFFIX_PATTERN,
  UNKNOWN_STATIC_VALUE,
} from "./lender-portal-production-acceptance-contract";
import {
  fail,
  resolveLenderPortalRepositoryPath,
} from "./lender-portal-production-acceptance-io";

export function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

export function hasExportedSymbol(source: ts.SourceFile, name: string) {
  return source.statements.some((statement) => {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) {
      if (!ts.isExportDeclaration(statement)) {
        return false;
      }
      const exportClause = statement.exportClause;
      return (
        !!exportClause &&
        ts.isNamedExports(exportClause) &&
        exportClause.elements.some(
          (element) => (element.propertyName ?? element.name).text === name
        )
      );
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return true;
    }
    return (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name
      )
    );
  });
}

export function resolveImportedProductionModule(args: {
  importModule: string;
  repositoryRoot: string;
  routeSource: string;
}) {
  let logicalPath: string;
  if (args.importModule.startsWith("#/")) {
    logicalPath = `src/${args.importModule.slice(2)}`;
  } else if (args.importModule.startsWith(".")) {
    logicalPath = join(dirname(args.routeSource), args.importModule);
  } else {
    fail(
      `Production route import must resolve to a repository module: ${args.importModule}`
    );
  }
  const candidates = extname(logicalPath)
    ? [logicalPath]
    : [
        `${logicalPath}.tsx`,
        `${logicalPath}.ts`,
        `${logicalPath}.js`,
        `${logicalPath}.d.ts`,
        join(logicalPath, "index.tsx"),
        join(logicalPath, "index.ts"),
      ];
  for (const candidate of candidates) {
    const absoluteCandidate = resolve(args.repositoryRoot, candidate);
    if (existsSync(absoluteCandidate)) {
      return resolveLenderPortalRepositoryPath(args.repositoryRoot, candidate);
    }
  }
  fail(`Production route import does not resolve: ${args.importModule}`);
}

export function unaliasedNamedImport(
  source: ts.SourceFile,
  moduleName: string,
  symbolName: string
) {
  return source.statements.some((statement) => {
    if (
      !(
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      !!bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) => !element.propertyName && element.name.text === symbolName
      )
    );
  });
}

export function importBinding(
  source: ts.SourceFile,
  localName: string
): { importedName: string; moduleName: string } | undefined {
  const bindings: Array<{ importedName: string; moduleName: string }> = [];
  for (const statement of source.statements) {
    if (
      !(
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      )
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!(namedBindings && ts.isNamedImports(namedBindings))) {
      continue;
    }
    for (const element of namedBindings.elements) {
      if (element.name.text === localName) {
        bindings.push({
          importedName: element.propertyName?.text ?? element.name.text,
          moduleName: statement.moduleSpecifier.text,
        });
      }
    }
  }
  if (bindings.length > 1) {
    fail(`Imported binding ${localName} is ambiguous`);
  }
  return bindings[0];
}

export function namedFunctionBody(source: ts.SourceFile, name: string) {
  const bodies: ts.ConciseBody[] = [];
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      statement.body
    ) {
      bodies.push(statement.body);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          bodies.push(declaration.initializer.body);
        }
      }
    }
  }
  if (bodies.length > 1) {
    fail(`Function binding ${name} is ambiguous`);
  }
  return bodies[0];
}

export function routeComponentName(source: ts.SourceFile, routerPath: string) {
  const routeFactory = importBinding(source, "createFileRoute");
  if (
    routeFactory?.moduleName !== "@tanstack/react-router" ||
    routeFactory.importedName !== "createFileRoute"
  ) {
    fail("createFileRoute must resolve to the direct TanStack Router binding");
  }
  const routeCalls: ts.CallExpression[] = [];
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "createFileRoute"
    ) {
      routeCalls.push(node);
    }
  });
  if (routeCalls.length !== 1) {
    fail(
      "Production route source must contain exactly one createFileRoute registration"
    );
  }
  const routeDeclaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) =>
      statement.declarationList.declarations.map((declaration) => ({
        declaration,
        exported:
          ts
            .getModifiers(statement)
            ?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
            ) ?? false,
      }))
    )
    .find(
      ({ declaration, exported }) =>
        exported &&
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "Route" &&
        declaration.initializer === routeCalls[0]
    );
  const routeCall = routeDeclaration?.declaration.initializer;
  if (!(routeCall && ts.isCallExpression(routeCall))) {
    fail("Production Route export does not own the unique route registration");
  }
  const factoryCall = routeCall.expression;
  if (
    !(
      ts.isCallExpression(factoryCall) &&
      factoryCall.arguments[0] &&
      ts.isStringLiteral(factoryCall.arguments[0])
    ) ||
    factoryCall.arguments[0].text !== routerPath ||
    !routeCall.arguments[0] ||
    !ts.isObjectLiteralExpression(routeCall.arguments[0])
  ) {
    fail(`Production Route export is not registered at ${routerPath}`);
  }
  const componentProperties = routeCall.arguments[0].properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      property.name.getText(source) === "component"
  );
  if (
    componentProperties.length !== 1 ||
    !ts.isIdentifier(componentProperties[0]?.initializer)
  ) {
    fail("Production Route component binding is missing or ambiguous");
  }
  return componentProperties[0].initializer.text;
}

type StaticPrimitive = bigint | boolean | null | number | string | undefined;
type StaticExpressionValue = StaticPrimitive | typeof UNKNOWN_STATIC_VALUE;

export function isKnownStaticValue(
  value: StaticExpressionValue
): value is StaticPrimitive {
  return value !== UNKNOWN_STATIC_VALUE;
}

export function staticLooseEquality(
  left: StaticPrimitive,
  right: StaticPrimitive
) {
  if (
    (left === null && right === undefined) ||
    (left === undefined && right === null)
  ) {
    return true;
  }
  if (typeof left === typeof right) {
    return left === right;
  }
  if (typeof left === "boolean") {
    return staticLooseEquality(Number(left), right);
  }
  if (typeof right === "boolean") {
    return staticLooseEquality(left, Number(right));
  }
  if (typeof left === "number" && typeof right === "string") {
    return left === Number(right);
  }
  if (typeof left === "string" && typeof right === "number") {
    return Number(left) === right;
  }
  if (typeof left === "bigint" && typeof right === "string") {
    try {
      return left === BigInt(right);
    } catch {
      return false;
    }
  }
  if (typeof left === "string" && typeof right === "bigint") {
    try {
      return BigInt(left) === right;
    } catch {
      return false;
    }
  }
  return false;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Static comparisons deliberately model only the primitive constant subset needed for fail-closed reachability.
export function staticRelationalComparison(
  left: StaticPrimitive,
  operator: ts.SyntaxKind,
  right: StaticPrimitive
): boolean | undefined {
  let comparison: number | undefined;
  if (typeof left === "number" && typeof right === "number") {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  } else if (typeof left === "string" && typeof right === "string") {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  } else if (typeof left === "bigint" && typeof right === "bigint") {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  }
  if (comparison === undefined) {
    return;
  }
  if (operator === ts.SyntaxKind.LessThanToken) {
    return comparison < 0;
  }
  if (operator === ts.SyntaxKind.LessThanEqualsToken) {
    return comparison <= 0;
  }
  if (operator === ts.SyntaxKind.GreaterThanToken) {
    return comparison > 0;
  }
  return comparison >= 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a deliberately explicit, side-effect-free evaluator for the supported static expression subset.
export function staticExpressionValue(
  expression: ts.Expression
): StaticExpressionValue {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return staticExpressionValue(expression.expression);
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }
  if (ts.isBigIntLiteral(expression)) {
    return BigInt(
      expression.text.replaceAll("_", "").replace(BIGINT_SUFFIX_PATTERN, "")
    );
  }
  if (ts.isVoidExpression(expression)) {
    return;
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = staticExpressionValue(expression.operand);
    if (!isKnownStaticValue(operand)) {
      return UNKNOWN_STATIC_VALUE;
    }
    if (expression.operator === ts.SyntaxKind.ExclamationToken) {
      return !operand;
    }
    if (expression.operator === ts.SyntaxKind.PlusToken) {
      return typeof operand === "bigint"
        ? UNKNOWN_STATIC_VALUE
        : Number(operand);
    }
    if (expression.operator === ts.SyntaxKind.MinusToken) {
      if (typeof operand === "bigint") {
        return -operand;
      }
      return Number.isNaN(Number(operand))
        ? UNKNOWN_STATIC_VALUE
        : -Number(operand);
    }
  }
  if (ts.isConditionalExpression(expression)) {
    const condition = staticExpressionTruthiness(expression.condition);
    if (condition === true) {
      return staticExpressionValue(expression.whenTrue);
    }
    if (condition === false) {
      return staticExpressionValue(expression.whenFalse);
    }
    return UNKNOWN_STATIC_VALUE;
  }
  if (ts.isBinaryExpression(expression)) {
    const left = staticExpressionValue(expression.left);
    const operator = expression.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (!isKnownStaticValue(left)) {
        return UNKNOWN_STATIC_VALUE;
      }
      return left ? staticExpressionValue(expression.right) : left;
    }
    if (operator === ts.SyntaxKind.BarBarToken) {
      if (!isKnownStaticValue(left)) {
        return UNKNOWN_STATIC_VALUE;
      }
      return left ? left : staticExpressionValue(expression.right);
    }
    if (operator === ts.SyntaxKind.QuestionQuestionToken) {
      return isKnownStaticValue(left) && left !== null && left !== undefined
        ? left
        : isKnownStaticValue(left)
          ? staticExpressionValue(expression.right)
          : UNKNOWN_STATIC_VALUE;
    }
    const right = staticExpressionValue(expression.right);
    if (!(isKnownStaticValue(left) && isKnownStaticValue(right))) {
      return UNKNOWN_STATIC_VALUE;
    }
    if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      return left === right;
    }
    if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
      return left !== right;
    }
    if (operator === ts.SyntaxKind.EqualsEqualsToken) {
      return staticLooseEquality(left, right);
    }
    if (operator === ts.SyntaxKind.ExclamationEqualsToken) {
      return !staticLooseEquality(left, right);
    }
    if (
      operator === ts.SyntaxKind.LessThanToken ||
      operator === ts.SyntaxKind.LessThanEqualsToken ||
      operator === ts.SyntaxKind.GreaterThanToken ||
      operator === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      return (
        staticRelationalComparison(left, operator, right) ??
        UNKNOWN_STATIC_VALUE
      );
    }
  }
  return UNKNOWN_STATIC_VALUE;
}

export function staticExpressionTruthiness(
  expression: ts.Expression
): boolean | undefined {
  const value = staticExpressionValue(expression);
  return isKnownStaticValue(value) ? Boolean(value) : undefined;
}

interface ReachabilityOutcome {
  breaks: boolean;
  continues: boolean;
  normal: boolean;
  returns: boolean;
  stops: boolean;
  throws: boolean;
}

const NORMAL_REACHABILITY: ReachabilityOutcome = {
  breaks: false,
  continues: false,
  normal: true,
  returns: false,
  stops: false,
  throws: false,
};

export function abruptReachability(
  kind: Exclude<keyof ReachabilityOutcome, "normal">
): ReachabilityOutcome {
  return { ...NORMAL_REACHABILITY, [kind]: true, normal: false };
}

export function combineReachability(
  ...outcomes: ReachabilityOutcome[]
): ReachabilityOutcome {
  return outcomes.reduce(
    (combined, outcome) => ({
      breaks: combined.breaks || outcome.breaks,
      continues: combined.continues || outcome.continues,
      normal: combined.normal || outcome.normal,
      returns: combined.returns || outcome.returns,
      stops: combined.stops || outcome.stops,
      throws: combined.throws || outcome.throws,
    }),
    {
      breaks: false,
      continues: false,
      normal: false,
      returns: false,
      stops: false,
      throws: false,
    }
  );
}

export function sequenceReachability(
  before: ReachabilityOutcome,
  after: ReachabilityOutcome
): ReachabilityOutcome {
  return {
    breaks: before.breaks || (before.normal && after.breaks),
    continues: before.continues || (before.normal && after.continues),
    normal: before.normal && after.normal,
    returns: before.returns || (before.normal && after.returns),
    stops: before.stops || (before.normal && after.stops),
    throws: before.throws || (before.normal && after.throws),
  };
}

export function consumeBreaks(
  outcome: ReachabilityOutcome
): ReachabilityOutcome {
  return {
    ...outcome,
    breaks: false,
    normal: outcome.normal || outcome.breaks,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Reachability must propagate all possible normal and abrupt completions across JavaScript control-flow constructs in one fail-closed traversal contract.
export function walkReachableNode(
  node: ts.Node,
  visit: (node: ts.Node) => void,
  root = true
): ReachabilityOutcome {
  visit(node);
  if (!root && ts.isFunctionLike(node)) {
    return NORMAL_REACHABILITY;
  }
  if (ts.isBlock(node)) {
    let outcome = NORMAL_REACHABILITY;
    for (const statement of node.statements) {
      if (!outcome.normal) {
        break;
      }
      outcome = sequenceReachability(
        outcome,
        walkReachableNode(statement, visit, false)
      );
    }
    return outcome;
  }
  if (ts.isReturnStatement(node)) {
    if (node.expression) {
      walkReachableNode(node.expression, visit, false);
    }
    return abruptReachability("returns");
  }
  if (ts.isThrowStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    return abruptReachability("throws");
  }
  if (ts.isBreakStatement(node)) {
    return abruptReachability("breaks");
  }
  if (ts.isContinueStatement(node)) {
    return abruptReachability("continues");
  }
  if (ts.isIfStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    const conditionTruthiness = staticExpressionTruthiness(node.expression);
    if (conditionTruthiness === false) {
      return node.elseStatement
        ? walkReachableNode(node.elseStatement, visit, false)
        : NORMAL_REACHABILITY;
    }
    if (conditionTruthiness === true) {
      return walkReachableNode(node.thenStatement, visit, false);
    }
    const thenOutcome = walkReachableNode(node.thenStatement, visit, false);
    const elseOutcome = node.elseStatement
      ? walkReachableNode(node.elseStatement, visit, false)
      : NORMAL_REACHABILITY;
    return combineReachability(thenOutcome, elseOutcome);
  }
  if (ts.isConditionalExpression(node)) {
    walkReachableNode(node.condition, visit, false);
    const conditionTruthiness = staticExpressionTruthiness(node.condition);
    if (conditionTruthiness === false) {
      return walkReachableNode(node.whenFalse, visit, false);
    }
    if (conditionTruthiness === true) {
      return walkReachableNode(node.whenTrue, visit, false);
    }
    walkReachableNode(node.whenTrue, visit, false);
    walkReachableNode(node.whenFalse, visit, false);
    return NORMAL_REACHABILITY;
  }
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    walkReachableNode(node.left, visit, false);
    const leftValue = staticExpressionValue(node.left);
    const leftTruthiness = isKnownStaticValue(leftValue)
      ? Boolean(leftValue)
      : undefined;
    const skipsRight =
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        leftTruthiness === false) ||
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
        leftTruthiness === true) ||
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
        isKnownStaticValue(leftValue) &&
        leftValue !== null &&
        leftValue !== undefined);
    if (!skipsRight) {
      walkReachableNode(node.right, visit, false);
    }
    return NORMAL_REACHABILITY;
  }
  if (ts.isWhileStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    const conditionTruthiness = staticExpressionTruthiness(node.expression);
    if (conditionTruthiness === false) {
      return NORMAL_REACHABILITY;
    }
    const body = walkReachableNode(node.statement, visit, false);
    return {
      breaks: false,
      continues: false,
      normal: conditionTruthiness !== true || body.breaks,
      returns: body.returns,
      stops:
        body.stops ||
        ((body.normal || body.continues) && conditionTruthiness === true),
      throws: body.throws,
    };
  }
  if (ts.isForStatement(node)) {
    if (node.initializer) {
      walkReachableNode(node.initializer, visit, false);
    }
    if (node.condition) {
      walkReachableNode(node.condition, visit, false);
    }
    if (
      node.condition &&
      staticExpressionTruthiness(node.condition) === false
    ) {
      return NORMAL_REACHABILITY;
    }
    const body = walkReachableNode(node.statement, visit, false);
    if (node.incrementor && (body.normal || body.continues)) {
      walkReachableNode(node.incrementor, visit, false);
    }
    const conditionTruthiness = node.condition
      ? staticExpressionTruthiness(node.condition)
      : true;
    return {
      breaks: false,
      continues: false,
      normal: conditionTruthiness !== true || body.breaks,
      returns: body.returns,
      stops:
        body.stops ||
        ((body.normal || body.continues) && conditionTruthiness !== false),
      throws: body.throws,
    };
  }
  if (ts.isDoStatement(node)) {
    const body = walkReachableNode(node.statement, visit, false);
    if (body.normal || body.continues) {
      walkReachableNode(node.expression, visit, false);
    }
    const conditionTruthiness = staticExpressionTruthiness(node.expression);
    return {
      breaks: false,
      continues: false,
      normal:
        body.breaks ||
        ((body.normal || body.continues) && conditionTruthiness !== true),
      returns: body.returns,
      stops:
        body.stops ||
        ((body.normal || body.continues) && conditionTruthiness === true),
      throws: body.throws,
    };
  }
  if (ts.isSwitchStatement(node)) {
    walkReachableNode(node.expression, visit, false);
    const discriminant = staticExpressionValue(node.expression);
    const clauses = [...node.caseBlock.clauses];
    const possibleStarts: number[] = [];
    let defaultIndex: number | undefined;
    let knownMatchFound = false;
    for (const [index, clause] of clauses.entries()) {
      if (ts.isDefaultClause(clause)) {
        defaultIndex = index;
        continue;
      }
      if (knownMatchFound) {
        continue;
      }
      walkReachableNode(clause.expression, visit, false);
      const caseValue = staticExpressionValue(clause.expression);
      if (
        !(isKnownStaticValue(discriminant) && isKnownStaticValue(caseValue))
      ) {
        possibleStarts.push(index);
      } else if (discriminant === caseValue) {
        possibleStarts.push(index);
        knownMatchFound = true;
      }
    }
    if (!knownMatchFound && defaultIndex !== undefined) {
      possibleStarts.push(defaultIndex);
    }
    const executeFrom = (start: number) => {
      let outcome = NORMAL_REACHABILITY;
      for (
        let index = start;
        index < clauses.length && outcome.normal;
        index += 1
      ) {
        const clause = clauses[index];
        if (!clause) {
          break;
        }
        for (const statement of clause.statements) {
          if (!outcome.normal) {
            break;
          }
          outcome = sequenceReachability(
            outcome,
            walkReachableNode(statement, visit, false)
          );
        }
      }
      return consumeBreaks(outcome);
    };
    const outcomes = [...new Set(possibleStarts)].map(executeFrom);
    if (!knownMatchFound && defaultIndex === undefined) {
      outcomes.push(NORMAL_REACHABILITY);
    }
    return outcomes.length > 0
      ? combineReachability(...outcomes)
      : NORMAL_REACHABILITY;
  }
  if (ts.isTryStatement(node)) {
    const tryOutcome = walkReachableNode(node.tryBlock, visit, false);
    let outcome = tryOutcome;
    if (node.catchClause && tryOutcome.throws) {
      const catchOutcome = walkReachableNode(
        node.catchClause.block,
        visit,
        false
      );
      outcome = combineReachability(
        { ...tryOutcome, throws: false },
        catchOutcome
      );
    }
    if (node.finallyBlock) {
      const finallyOutcome = walkReachableNode(node.finallyBlock, visit, false);
      const abruptFinally = { ...finallyOutcome, normal: false };
      outcome = finallyOutcome.normal
        ? combineReachability(outcome, abruptFinally)
        : abruptFinally;
    }
    return outcome;
  }
  node.forEachChild((child) => {
    walkReachableNode(child, visit, false);
  });
  return NORMAL_REACHABILITY;
}

export function walkReachable(
  node: ts.Node,
  visit: (node: ts.Node) => void,
  root = true
) {
  walkReachableNode(node, visit, root);
}

export function reachableReturnExpressions(body: ts.Node) {
  if (!ts.isBlock(body)) {
    return [body];
  }
  const expressions: ts.Expression[] = [];
  walkReachable(body, (node) => {
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
    }
  });
  return expressions;
}

export function expressionRenders(expression: ts.Node, symbolName: string) {
  let rendered = false;
  walkReachable(expression, (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === symbolName
    ) {
      rendered = true;
    }
  });
  return rendered;
}

export function bodyReturnsRenderedSymbol(body: ts.Node, symbolName: string) {
  return reachableReturnExpressions(body).some((expression) =>
    expressionRenders(expression, symbolName)
  );
}

export function bodyShadowsIdentifier(body: ts.Node, name: string) {
  let shadowed = false;
  walkReachable(body, (node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      shadowed = true;
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name?.text === name
    ) {
      shadowed = true;
    }
  });
  return shadowed;
}

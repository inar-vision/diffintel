import type { SyntaxNode } from "../parsing/parser";
import { ChangeType } from "./types";

export interface ExtractedDecl {
  name: string;
  changeType?: ChangeType;
}

export interface NodeTypeConfig {
  changeType: ChangeType;
  /**
   * Custom extractor for nodes needing special name/type logic.
   * Return null to skip the node entirely.
   * Return array for nodes containing multiple declarations.
   * If omitted, default: [{ name: node.childForFieldName("name")?.text }]
   */
  extractor?: (node: SyntaxNode) => ExtractedDecl[] | null;
}

export interface LanguageConfig {
  id: string;
  extensions: string[];
  treeSitterPackage: string;
  /** Sub-property to access on the module (e.g. "php" for tree-sitter-php which exports { php, php_only }) */
  treeSitterSubProperty?: string;
  nodeTypeMap: Record<string, NodeTypeConfig>;
  /** Wrapper nodes that contain the real declaration (e.g. Python decorated_definition) */
  wrapperTypes?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript
// ---------------------------------------------------------------------------

const javascriptConfig: LanguageConfig = {
  id: "javascript",
  extensions: [".js", ".jsx"],
  treeSitterPackage: "tree-sitter-javascript",
  nodeTypeMap: {
    function_declaration: { changeType: "function" },
    class_declaration: { changeType: "class" },
    import_statement: {
      changeType: "import",
      extractor: (node) => {
        const source = node.childForFieldName("source")?.text || node.text;
        return [{ name: source }];
      },
    },
    export_statement: {
      changeType: "export",
      extractor: (node) => {
        const decl = node.childForFieldName("declaration");
        if (decl) {
          const name = decl.childForFieldName("name")?.text;
          if (name) return [{ name }];
        }
        return [{ name: node.text.slice(0, 60) }];
      },
    },
    lexical_declaration: {
      changeType: "variable",
      extractor: (node) => extractJsVariableDeclarators(node),
    },
    variable_declaration: {
      changeType: "variable",
      extractor: (node) => extractJsVariableDeclarators(node),
    },
    expression_statement: {
      changeType: "export",
      extractor: (node) => {
        const expr = node.child(0);
        if (expr?.type === "assignment_expression") {
          const left = expr.childForFieldName("left");
          if (left?.text?.startsWith("module.exports")) {
            return [{ name: "module.exports" }];
          }
        }
        return null;
      },
    },
  },
};

function extractJsVariableDeclarators(node: SyntaxNode): ExtractedDecl[] | null {
  const results: ExtractedDecl[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "variable_declarator") {
      const name = child.childForFieldName("name")?.text || "<unknown>";
      const value = child.childForFieldName("value");
      const isFn = value && (value.type === "arrow_function" || value.type === "function");
      results.push({ name, changeType: isFn ? "function" : "variable" });
    }
  }
  return results.length > 0 ? results : null;
}

const typescriptConfig: LanguageConfig = {
  ...javascriptConfig,
  id: "typescript",
  extensions: [".ts", ".tsx"],
  treeSitterPackage: "tree-sitter-typescript",
};

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

const pythonConfig: LanguageConfig = {
  id: "python",
  extensions: [".py"],
  treeSitterPackage: "tree-sitter-python",
  wrapperTypes: { decorated_definition: "definition" },
  nodeTypeMap: {
    function_definition: { changeType: "function" },
    class_definition: { changeType: "class" },
    import_statement: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    import_from_statement: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    expression_statement: {
      changeType: "variable",
      extractor: (node) => {
        const expr = node.child(0);
        if (expr?.type === "assignment") {
          const left = expr.childForFieldName("left");
          if (left) return [{ name: left.text }];
        }
        return null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

const goConfig: LanguageConfig = {
  id: "go",
  extensions: [".go"],
  treeSitterPackage: "tree-sitter-go",
  nodeTypeMap: {
    function_declaration: { changeType: "function" },
    method_declaration: {
      changeType: "function",
      extractor: (node) => {
        const receiver = node.childForFieldName("receiver")?.text || "";
        const name = node.childForFieldName("name")?.text || "<anonymous>";
        return [{ name: receiver ? `(${receiver}).${name}` : name }];
      },
    },
    type_declaration: {
      changeType: "class",
      extractor: (node) => {
        const specs: ExtractedDecl[] = [];
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "type_spec") {
            const name = child.childForFieldName("name")?.text || "<anonymous>";
            specs.push({ name });
          }
        }
        return specs.length > 0 ? specs : null;
      },
    },
    import_declaration: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    var_declaration: {
      changeType: "variable",
      extractor: (node) => {
        const specs: ExtractedDecl[] = [];
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "var_spec") {
            const name = child.childForFieldName("name")?.text;
            if (name) specs.push({ name });
          }
        }
        return specs.length > 0 ? specs : null;
      },
    },
    const_declaration: {
      changeType: "variable",
      extractor: (node) => {
        const specs: ExtractedDecl[] = [];
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "const_spec") {
            const name = child.childForFieldName("name")?.text;
            if (name) specs.push({ name });
          }
        }
        return specs.length > 0 ? specs : null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

const rustConfig: LanguageConfig = {
  id: "rust",
  extensions: [".rs"],
  treeSitterPackage: "tree-sitter-rust",
  nodeTypeMap: {
    function_item: { changeType: "function" },
    struct_item: { changeType: "class" },
    enum_item: { changeType: "class" },
    trait_item: { changeType: "class" },
    impl_item: {
      changeType: "class",
      extractor: (node) => {
        const type = node.childForFieldName("type")?.text || "<anonymous>";
        const trait = node.childForFieldName("trait")?.text;
        const name = trait ? `${trait} for ${type}` : `impl ${type}`;
        return [{ name }];
      },
    },
    use_declaration: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    const_item: { changeType: "variable" },
    static_item: { changeType: "variable" },
    type_item: { changeType: "class" },
    mod_item: { changeType: "export" },
  },
};

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

const javaConfig: LanguageConfig = {
  id: "java",
  extensions: [".java"],
  treeSitterPackage: "tree-sitter-java",
  nodeTypeMap: {
    method_declaration: { changeType: "function" },
    class_declaration: { changeType: "class" },
    interface_declaration: { changeType: "class" },
    enum_declaration: { changeType: "class" },
    import_declaration: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    field_declaration: {
      changeType: "variable",
      extractor: (node) => {
        const declarator = node.childForFieldName("declarator");
        const name = declarator?.childForFieldName("name")?.text;
        return name ? [{ name }] : null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// C
// ---------------------------------------------------------------------------

const cConfig: LanguageConfig = {
  id: "c",
  extensions: [".c", ".h"],
  treeSitterPackage: "tree-sitter-c",
  nodeTypeMap: {
    function_definition: {
      changeType: "function",
      extractor: (node) => {
        const declarator = node.childForFieldName("declarator");
        if (!declarator) return null;
        // function_declarator -> inner declarator has the name
        const name = declarator.childForFieldName("declarator")?.text || declarator.text;
        return [{ name }];
      },
    },
    declaration: {
      changeType: "variable",
      extractor: (node) => {
        const declarator = node.childForFieldName("declarator");
        if (!declarator) return null;
        // function declarations vs variable declarations
        if (declarator.type === "function_declarator") {
          const name = declarator.childForFieldName("declarator")?.text;
          return name ? [{ name, changeType: "function" }] : null;
        }
        const name = declarator.childForFieldName("name")?.text || declarator.text;
        return name ? [{ name }] : null;
      },
    },
    struct_specifier: {
      changeType: "class",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text;
        return name ? [{ name }] : null;
      },
    },
    enum_specifier: {
      changeType: "class",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text;
        return name ? [{ name }] : null;
      },
    },
    preproc_include: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    type_definition: {
      changeType: "class",
      extractor: (node) => {
        const declarator = node.childForFieldName("declarator");
        const name = declarator?.text;
        return name ? [{ name }] : null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// C++
// ---------------------------------------------------------------------------

const cppConfig: LanguageConfig = {
  id: "cpp",
  extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hh"],
  treeSitterPackage: "tree-sitter-cpp",
  nodeTypeMap: {
    ...cConfig.nodeTypeMap,
    class_specifier: {
      changeType: "class",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text;
        return name ? [{ name }] : null;
      },
    },
    namespace_definition: {
      changeType: "export",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text || "<anonymous>";
        return [{ name }];
      },
    },
    template_declaration: {
      changeType: "function",
      extractor: (node) => {
        // Unwrap the inner declaration
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "function_definition") {
            const name = child.childForFieldName("declarator")?.childForFieldName("declarator")?.text;
            return name ? [{ name }] : null;
          }
          if (child.type === "class_specifier") {
            const name = child.childForFieldName("name")?.text;
            return name ? [{ name, changeType: "class" }] : null;
          }
        }
        return null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Ruby
// ---------------------------------------------------------------------------

const rubyConfig: LanguageConfig = {
  id: "ruby",
  extensions: [".rb"],
  treeSitterPackage: "tree-sitter-ruby",
  nodeTypeMap: {
    method: { changeType: "function" },
    singleton_method: { changeType: "function" },
    class: {
      changeType: "class",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text;
        return name ? [{ name }] : null;
      },
    },
    module: {
      changeType: "class",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text;
        return name ? [{ name }] : null;
      },
    },
    call: {
      changeType: "import",
      extractor: (node) => {
        const method = node.childForFieldName("method")?.text;
        if (method === "require" || method === "require_relative") {
          return [{ name: node.text }];
        }
        return null;
      },
    },
    assignment: {
      changeType: "variable",
      extractor: (node) => {
        const left = node.childForFieldName("left");
        if (left) return [{ name: left.text }];
        return null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

const phpConfig: LanguageConfig = {
  id: "php",
  extensions: [".php"],
  treeSitterPackage: "tree-sitter-php",
  treeSitterSubProperty: "php",
  nodeTypeMap: {
    function_definition: { changeType: "function" },
    method_declaration: { changeType: "function" },
    class_declaration: { changeType: "class" },
    interface_declaration: { changeType: "class" },
    trait_declaration: { changeType: "class" },
    namespace_use_declaration: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    namespace_definition: {
      changeType: "export",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text || "<anonymous>";
        return [{ name }];
      },
    },
    property_declaration: {
      changeType: "variable",
      extractor: (node) => {
        // Try to extract property name from first property element
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "property_element") {
            const name = child.child(0)?.text;
            if (name) return [{ name }];
          }
        }
        return null;
      },
    },
    const_declaration: {
      changeType: "variable",
      extractor: (node) => {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "const_element") {
            const name = child.childForFieldName("name")?.text;
            if (name) return [{ name }];
          }
        }
        return null;
      },
    },
  },
};

// ---------------------------------------------------------------------------
// C#
// ---------------------------------------------------------------------------

const csharpConfig: LanguageConfig = {
  id: "csharp",
  extensions: [".cs"],
  treeSitterPackage: "tree-sitter-c-sharp",
  nodeTypeMap: {
    method_declaration: { changeType: "function" },
    class_declaration: { changeType: "class" },
    interface_declaration: { changeType: "class" },
    struct_declaration: { changeType: "class" },
    enum_declaration: { changeType: "class" },
    namespace_declaration: {
      changeType: "export",
      extractor: (node) => {
        const name = node.childForFieldName("name")?.text || "<anonymous>";
        return [{ name }];
      },
    },
    using_directive: {
      changeType: "import",
      extractor: (node) => [{ name: node.text }],
    },
    field_declaration: {
      changeType: "variable",
      extractor: (node) => {
        const decl = node.childForFieldName("declaration");
        if (!decl) return null;
        for (let i = 0; i < decl.childCount; i++) {
          const child = decl.child(i)!;
          if (child.type === "variable_declarator") {
            const name = child.childForFieldName("name")?.text;
            if (name) return [{ name }];
          }
        }
        return null;
      },
    },
    property_declaration: { changeType: "variable" },
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const languageConfigs: LanguageConfig[] = [
  javascriptConfig,
  typescriptConfig,
  pythonConfig,
  goConfig,
  rustConfig,
  javaConfig,
  cConfig,
  cppConfig,
  rubyConfig,
  phpConfig,
  csharpConfig,
];

/** Look up a language config by file extension */
export function getConfigForExtension(ext: string): LanguageConfig | null {
  return languageConfigs.find((c) => c.extensions.includes(ext)) || null;
}

/** Get all supported file extensions across all configs */
export function getAllSupportedExtensions(): Set<string> {
  const exts = new Set<string>();
  for (const config of languageConfigs) {
    for (const ext of config.extensions) {
      exts.add(ext);
    }
  }
  return exts;
}

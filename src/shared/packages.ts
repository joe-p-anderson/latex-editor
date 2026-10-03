/** A package to load, with options only where they matter (\usepackage[T1]{fontenc}). */
export type PackageSpec = string | { name: string; options: string }

/** Its \usepackage line. */
export const usePackageLine = (p: PackageSpec) => (typeof p === 'string' ? `\\usepackage{${p}}` : `\\usepackage[${p.options}]{${p.name}}`)

export function idsEqual(a: string, b: string): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return a.startsWith(b) || b.startsWith(a)
}

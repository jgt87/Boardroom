// Languages offered by code blocks; ids match Prism grammar names.
export const codeLanguages = [
  { id: 'plaintext', label: 'Plain text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'json', label: 'JSON' },
  { id: 'markup', label: 'HTML / XML' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Shell' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
] as const;
export type CodeLanguage = (typeof codeLanguages)[number]['id'];

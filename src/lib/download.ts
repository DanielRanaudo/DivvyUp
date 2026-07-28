/** Hands the browser a file it never had to fetch. */
export function downloadText(
  filename: string,
  text: string,
  type = "text/csv;charset=utf-8"
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

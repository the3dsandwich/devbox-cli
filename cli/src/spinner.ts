const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const withSpinner = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
  let frame = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${frames[frame++ % frames.length]} ${label}...`);
  }, 100);

  const clear = () => process.stdout.write("\r" + " ".repeat(label.length + 6) + "\r");

  try {
    const result = await task();
    clearInterval(interval);
    clear();
    return result;
  } catch (err) {
    clearInterval(interval);
    clear();
    throw err;
  }
};

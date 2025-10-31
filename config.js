
export const DEFAULT_PROMPT = 'Extract the text from the manga page image, which is in Japanese, and provide an Traditional Chinese translation while preserving the original formatting as much as possible. Make sure only text in manga content are translated. There are usually two pages of manga on the image - the right page and the left page, start extraction and translation from top right, then bottom right, then top left and finally bottom left. Show the original text along with the translation and keep the output simple and clear.';

export const GEMINI_MODEL_NAME = 'gemini-2.5-flash';

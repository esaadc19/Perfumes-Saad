import readXlsxFile from "read-excel-file/browser";
import type { NewProductInput, Product } from "./products";

type ImportVariant = { size: number; price: number; cost: number; stock: number };
export type ImportedProduct = { product: NewProductInput; variants: ImportVariant[]; sourceRows: number[] };
export type ImportedCustomer = {
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  sourceRows: number[];
};

const aliases: Record<string, string[]> = {
  brand: ["brand", "marca"],
  name: ["name", "nombre", "producto"],
  gender: ["gender", "genero"],
  category: ["category", "categoria"],
  description: ["description", "descripcion"],
  family: ["family", "familia", "familia_olfativa"],
  image_url: ["image_url", "imagen_url"],
  image_urls: ["image_urls", "imagenes_url"],
  size_ml: ["size_ml", "size", "ml", "tamano_ml", "presentacion_ml"],
  price: ["price", "precio"],
  cost: ["cost", "costo"],
  stock: ["stock", "existencias"],
};

const customerAliases: Record<string, string[]> = {
  full_name: ["full_name", "nombre", "nombre_completo", "cliente"],
  phone: ["phone", "telefono", "celular", "whatsapp"],
  email: ["email", "correo", "correo_electronico"],
  city: ["city", "ciudad"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseCsv(text: string): unknown[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, candidate) => {
    const count = firstLine.split(candidate).length;
    return count > firstLine.split(best).length ? candidate : best;
  }, ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("El CSV tiene comillas sin cerrar.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function cellText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "").trim();
}

function enumValue<T extends string>(
  value: string,
  values: readonly T[],
  label: string,
  rowNumber: number
): T {
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = values.find((item) =>
    item.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalized
  );
  if (!match) throw new Error(`Fila ${rowNumber}: ${label} no válido (“${value}”).`);
  return match;
}

function productGender(value: string, rowNumber: number): Product["gender"] {
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const aliases: Record<string, Product["gender"]> = {
    hombre: "Hombres",
    hombres: "Hombres",
    masculino: "Hombres",
    masculinos: "Hombres",
    mujer: "Mujeres",
    mujeres: "Mujeres",
    femenino: "Mujeres",
    femeninos: "Mujeres",
    unisex: "Unisex",
  };
  const gender = aliases[normalized];
  if (!gender) {
    throw new Error(`Fila ${rowNumber}: género no válido (“${value}”). Usa Hombre, Mujer o Unisex.`);
  }
  return gender;
}

function numericCell(value: string, label: string, rowNumber: number): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed)) {
    throw new Error(`Fila ${rowNumber}: ${label} debe ser numérico.`);
  }
  return parsed;
}

function parseRows(rows: unknown[][]): ImportedProduct[] {
  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders?.length) throw new Error("El archivo está vacío.");
  const headers = rawHeaders.map(normalizeHeader);
  const columns = new Map<string, number>();
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    const index = headers.findIndex((header) => fieldAliases.includes(header));
    if (index >= 0) columns.set(field, index);
  }

  const required = ["brand", "name", "gender", "category", "size_ml", "price", "cost", "stock"];
  const missing = required.filter((field) => !columns.has(field));
  if (missing.length) {
    throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);
  }

  const get = (row: unknown[], field: string) => cellText(row[columns.get(field) ?? -1]);
  const products = new Map<string, ImportedProduct>();
  dataRows.forEach((row, rowIndex) => {
    if (!row.some((value) => cellText(value))) return;
    const rowNumber = rowIndex + 2;
    const brand = get(row, "brand");
    const name = get(row, "name");
    if (!brand || !name) throw new Error(`Fila ${rowNumber}: marca y nombre son obligatorios.`);
    const gender = productGender(get(row, "gender"), rowNumber);
    const category = enumValue(get(row, "category"), ["Comercial", "Diseñador", "Árabes", "Nicho"] as const, "categoría", rowNumber);
    const size = numericCell(get(row, "size_ml"), "tamaño en ml", rowNumber);
    const price = numericCell(get(row, "price"), "precio", rowNumber);
    const cost = numericCell(get(row, "cost"), "costo", rowNumber);
    const stock = numericCell(get(row, "stock"), "stock", rowNumber);
    if (!Number.isInteger(size) || size <= 0 || price < 0 || cost < 0 || !Number.isInteger(stock) || stock < 0) {
      throw new Error(`Fila ${rowNumber}: verifica tamaño, precio, costo y stock.`);
    }

    const imageValues = [
      ...get(row, "image_urls").split("|"),
      get(row, "image_url"),
    ].map((url) => url.trim()).filter(Boolean);
    const imageUrls = [...new Set(imageValues)];
    if (imageUrls.length > 3) throw new Error(`Fila ${rowNumber}: máximo tres URL de imagen.`);
    for (const imageUrl of imageUrls) {
      try {
        const parsedUrl = new URL(imageUrl);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error();
      } catch {
        throw new Error(`Fila ${rowNumber}: URL de imagen no válida.`);
      }
    }

    const productKey = `${brand.trim().toLowerCase()}|${name.trim().toLowerCase()}`;
    const description = get(row, "description");
    const family = get(row, "family");
    const existing = products.get(productKey);
    if (existing) {
      if (
        existing.product.gender !== gender ||
        existing.product.category !== category
      ) {
        throw new Error(`Fila ${rowNumber}: género y categoría deben coincidir entre las presentaciones del producto.`);
      }
      if (description && existing.product.description && existing.product.description !== description) {
        throw new Error(`Fila ${rowNumber}: las descripciones del producto no coinciden.`);
      }
      if (!existing.product.description && description) existing.product.description = description;
      if (family && existing.product.family && existing.product.family !== family) {
        throw new Error(`Fila ${rowNumber}: las familias olfativas del producto no coinciden.`);
      }
      if (!existing.product.family && family) existing.product.family = family;
      if (imageUrls.length && existing.product.image_urls?.length && existing.product.image_urls.join("|") !== imageUrls.join("|")) {
        throw new Error(`Fila ${rowNumber}: conserva las mismas imágenes en todas las filas del producto.`);
      }
      if (!existing.product.image_urls?.length && imageUrls.length) {
        existing.product.image_urls = imageUrls;
        existing.product.image_url = imageUrls[0];
      }
      if (existing.variants.some((variant) => variant.size === size)) {
        throw new Error(`Fila ${rowNumber}: la presentación ${size} ml está duplicada.`);
      }
      existing.variants.push({ size, price, cost, stock });
      existing.sourceRows.push(rowNumber);
      return;
    }

    const product: NewProductInput = {
      brand: brand.trim(),
      name: name.trim(),
      gender,
      category,
      description,
      family,
      climate: ["Todo el año"],
      image_url: imageUrls[0] ?? "",
      image_urls: imageUrls,
    };
    products.set(productKey, {
      product,
      variants: [{ size, price, cost, stock }],
      sourceRows: [rowNumber],
    });
  });
  if (!products.size) throw new Error("El archivo no contiene filas de productos.");
  return [...products.values()];
}

function parseCustomerRows(rows: unknown[][]): ImportedCustomer[] {
  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders?.length) throw new Error("El archivo está vacío.");
  const headers = rawHeaders.map(normalizeHeader);
  const columns = new Map<string, number>();
  for (const [field, fieldAliases] of Object.entries(customerAliases)) {
    const index = headers.findIndex((header) => fieldAliases.includes(header));
    if (index >= 0) columns.set(field, index);
  }
  if (!columns.has("full_name")) {
    throw new Error("Falta la columna obligatoria: full_name (nombre).");
  }

  const get = (row: unknown[], field: string) => cellText(row[columns.get(field) ?? -1]);
  const customers = new Map<string, ImportedCustomer>();
  dataRows.forEach((row, rowIndex) => {
    if (!row.some((value) => cellText(value))) return;
    const rowNumber = rowIndex + 2;
    const fullName = get(row, "full_name");
    const phone = get(row, "phone") || null;
    const emailValue = get(row, "email");
    const email = emailValue ? emailValue.toLowerCase() : null;
    const city = get(row, "city") || null;
    if (!fullName) throw new Error(`Fila ${rowNumber}: el nombre del cliente es obligatorio.`);
    if (email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
      throw new Error(`Fila ${rowNumber}: el correo no tiene un formato válido.`);
    }
    if (!phone && !email) {
      throw new Error(`Fila ${rowNumber}: cada cliente debe tener correo o teléfono para evitar duplicados.`);
    }

    const key = email ? `email:${email}` : `phone:${phone}`;
    const existing = customers.get(key);
    if (existing) {
      if (
        existing.email !== email ||
        existing.phone !== phone ||
        existing.full_name.toLowerCase() !== fullName.toLowerCase()
      ) {
        throw new Error(`Fila ${rowNumber}: correo o teléfono duplicado con datos diferentes.`);
      }
      existing.sourceRows.push(rowNumber);
      return;
    }
    customers.set(key, {
      full_name: fullName,
      phone,
      email,
      city,
      sourceRows: [rowNumber],
    });
  });
  if (!customers.size) throw new Error("El archivo no contiene clientes para importar.");
  return [...customers.values()];
}

export async function parseProductImportFile(file: File): Promise<ImportedProduct[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo debe pesar máximo 10 MB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    return parseRows(parseCsv((await file.text()).replace(/^\uFEFF/, "")));
  }
  if (extension === "xlsx") {
    const sheets = await readXlsxFile(file);
    return parseRows(sheets[0]?.data ?? []);
  }
  throw new Error("Formato no compatible. Selecciona un archivo CSV o Excel .xlsx.");
}

export async function parseCustomerImportFile(file: File): Promise<ImportedCustomer[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo debe pesar máximo 10 MB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    return parseCustomerRows(parseCsv((await file.text()).replace(/^\uFEFF/, "")));
  }
  if (extension === "xlsx") {
    const sheets = await readXlsxFile(file);
    return parseCustomerRows(sheets[0]?.data ?? []);
  }
  throw new Error("Formato no compatible. Selecciona un archivo CSV o Excel .xlsx.");
}

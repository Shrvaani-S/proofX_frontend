// ProofX attribute definitions — 3 categories (text, graphics, barcode)
// Adapted from LabelIQ's lcm_attributes.json

export type LRFCategoryId = "text" | "graphics" | "barcode";

export const LRF_CHANGE_TYPES = ["Add", "Remove", "Modify"] as const;
export const LRF_SYMBOL_CHANGE_TYPES = ["Add", "Remove"] as const;
export const LRF_IMAGE_CHANGE_TYPES  = ["Add", "Remove", "Modify"] as const;
export type LRFChangeType = typeof LRF_CHANGE_TYPES[number];

export interface LRFAttributeDef {
  id: string;
  label: string;
  placeholder: string;
  isCustom?: boolean;
}

export interface LRFGroupDef {
  id: string;
  name: string;
  attributes: LRFAttributeDef[];
}

export interface LRFCategoryDef {
  id: LRFCategoryId;
  label: string;
  groups: LRFGroupDef[];
}

export const LRF_CATEGORIES: Record<LRFCategoryId, LRFCategoryDef> = {
  text: {
    id: "text",
    label: "Text",
    groups: [
      {
        id: "text_product_identification",
        name: "Product identification",
        attributes: [
          { id: "product_name",        label: "Product name",           placeholder: "e.g. QUICKSET STD → QUICKSET PRO" },
          { id: "product_description", label: "Product description",    placeholder: "e.g. Tissue Protector → Tissue Guard" },
          { id: "ref_catalogue",       label: "REF / catalogue number", placeholder: "e.g. 2440-00-511 → 2440-00-512" },
          { id: "lot_number",          label: "LOT number",             placeholder: "e.g. format change" },
          { id: "rev",                 label: "Rev",                    placeholder: "e.g. Rev D" },
          { id: "gtin_ean",            label: "GTIN / EAN",             placeholder: "e.g. 00840002600017 → 00840002600018" },
          { id: "quantity_pack_size",  label: "Quantity / pack size",   placeholder: "e.g. 10 → 5" },
        ],
      },
      {
        id: "text_dates",
        name: "Dates",
        attributes: [
          { id: "manufacture_date", label: "Manufacture date",          placeholder: "e.g. format YYYY-MM → MM/YYYY" },
          { id: "expiry_date",      label: "Expiry date / Use-by date", placeholder: "e.g. format change or removal" },
        ],
      },
      {
        id: "text_manufacturer",
        name: "Manufacturer & distributor",
        attributes: [
          { id: "manufacturer_name", label: "Manufacturer name",    placeholder: "e.g. name update" },
          { id: "made_in_country",   label: "Country of Origin",    placeholder: "e.g. Ireland → UK" },
          { id: "manufacturer_addr", label: "Manufacturer address", placeholder: "e.g. address update" },
          { id: "distributor_name",  label: "Distributor name",     placeholder: "e.g. name change" },
          { id: "distributor_addr",  label: "Distributor address",  placeholder: "e.g. address update" },
          { id: "ecrep_name",        label: "EC Rep name",          placeholder: "e.g. new EC Rep entity" },
          { id: "ecrep_addr",        label: "EC Rep address",       placeholder: "e.g. address update" },
        ],
      },
      {
        id: "text_urls",
        name: "URLs & references",
        attributes: [
          { id: "website_url",      label: "Website URL",           placeholder: "e.g. www.company.com → new URL" },
          { id: "eifu_url",         label: "eIFU URL",              placeholder: "e.g. www.e-ifu.com" },
          { id: "patent_url",       label: "Patent URL",            placeholder: "e.g. patentmarking URL change" },
          { id: "symbols_glossary", label: "Symbols glossary URL",  placeholder: "e.g. https://www.e-ifu.com/symbols-glossary" },
        ],
      },
      {
        id: "text_regulatory",
        name: "Regulatory & UDI",
        attributes: [
          { id: "udi_di",          label: "UDI-DI",                    placeholder: "e.g. new UDI-DI value" },
          { id: "udi_pi",          label: "UDI-PI",                    placeholder: "e.g. format change" },
          { id: "gtin_encoded",    label: "GTIN encoded value",        placeholder: "e.g. value update" },
          { id: "notified_body",   label: "Notified body number",      placeholder: "e.g. 0086 → 0344" },
          { id: "us_canada_phone", label: "US / Canada phone number",  placeholder: "e.g. number update" },
          { id: "eu_phone",        label: "EU phone number",           placeholder: "e.g. new number" },
        ],
      },
      {
        id: "text_warnings",
        name: "Warnings & instructions",
        attributes: [
          { id: "warning_text",       label: "Warning text",              placeholder: "e.g. text addition or modification" },
          { id: "caution_text",       label: "Caution text",              placeholder: "e.g. text change" },
          { id: "contraindication",   label: "Contraindication text",     placeholder: "e.g. new contraindication added" },
          { id: "sterile_method",     label: "Sterilisation method text", placeholder: "e.g. EO → Radiation" },
          { id: "single_use_stmt",    label: "Single-use statement",      placeholder: "e.g. added / removed / modified" },
          { id: "storage_conditions", label: "Storage conditions",        placeholder: "e.g. added storage condition" },
          { id: "temperature_range",  label: "Temperature range",         placeholder: "e.g. +15°C to +25°C → +10°C to +30°C" },
        ],
      },
      {
        id: "text_languages",
        name: "Language variants",
        attributes: [
          { id: "lang_en", label: "English (en)",    placeholder: "e.g. text correction" },
          { id: "lang_de", label: "German (de)",     placeholder: "e.g. translation update" },
          { id: "lang_es", label: "Spanish (es)",    placeholder: "e.g. translation update" },
          { id: "lang_fr", label: "French (fr)",     placeholder: "e.g. translation update" },
          { id: "lang_it", label: "Italian (it)",    placeholder: "e.g. translation update" },
          { id: "lang_pt", label: "Portuguese (pt)", placeholder: "e.g. translation update" },
          { id: "lang_nl", label: "Dutch (nl)",      placeholder: "e.g. translation update" },
          { id: "lang_da", label: "Danish (da)",     placeholder: "e.g. translation update" },
          { id: "lang_sv", label: "Swedish (sv)",    placeholder: "e.g. translation update" },
          { id: "lang_no", label: "Norwegian (no)",  placeholder: "e.g. translation update" },
          { id: "lang_pl", label: "Polish (pl)",     placeholder: "e.g. translation added" },
          { id: "lang_cs", label: "Czech (cs)",      placeholder: "e.g. translation added" },
          { id: "lang_hu", label: "Hungarian (hu)",  placeholder: "e.g. translation added" },
          { id: "lang_ro", label: "Romanian (ro)",   placeholder: "e.g. translation added" },
          { id: "lang_tr", label: "Turkish (tr)",    placeholder: "e.g. translation added" },
          { id: "lang_ar", label: "Arabic (ar)",     placeholder: "e.g. translation added" },
          { id: "lang_zh", label: "Chinese (zh)",    placeholder: "e.g. translation added" },
          { id: "lang_ja", label: "Japanese (ja)",   placeholder: "e.g. translation added" },
          { id: "lang_ko", label: "Korean (ko)",     placeholder: "e.g. translation added" },
        ],
      },
      {
        id: "text_typography",
        name: "Typography",
        attributes: [
          { id: "font_size",      label: "Font size",       placeholder: "e.g. 8pt → 7pt" },
          { id: "font_weight",    label: "Font weight",     placeholder: "e.g. Regular → Bold" },
          { id: "text_alignment", label: "Text alignment",  placeholder: "e.g. Left → Centre" },
          { id: "text_colour",    label: "Text colour",     placeholder: "e.g. Black → Pantone 485" },
          { id: "font_family",    label: "Font family",     placeholder: "e.g. Helvetica → Arial" },
        ],
      },
    ],
  },

  graphics: {
    id: "graphics",
    label: "Graphics",
    groups: [
      // ── Symbols (sym_ prefix → Add/Remove only, no expected value) ─────────
      {
        id: "sym_regulatory",
        name: "Regulatory marks",
        attributes: [
          { id: "sym_ce_mark",        label: "CE Mark",                              placeholder: "Added / Removed / Repositioned" },
          { id: "sym_ce_nb",          label: "CE Mark — notified body number",       placeholder: "e.g. 0086 → 0344" },
          { id: "sym_ec_md_block",    label: "EC / MD block",                        placeholder: "e.g. Repositioned / size change" },
          { id: "sym_md",             label: "MD — Medical Device",                  placeholder: "e.g. Added per EU MDR 2017/745" },
          { id: "sym_rx_only",        label: "Prescription Only (Rx)",               placeholder: "e.g. Added / Removed" },
          { id: "sym_udi",            label: "Unique Device Identifier",             placeholder: "e.g. Added / Removed" },
          { id: "sym_ukca",           label: "UKCA Mark",                            placeholder: "e.g. Added for UK market" },
          { id: "sym_authorized_rep", label: "Authorised representative (EC Rep)",   placeholder: "e.g. symbol Added / Removed" },
        ],
      },
      {
        id: "sym_sterility",
        name: "Sterility",
        attributes: [
          { id: "sym_sterile",     label: "Sterile",                          placeholder: "e.g. Added / Removed" },
          { id: "sym_non_sterile", label: "Non-Sterile",                      placeholder: "e.g. Added / Removed / Repositioned" },
          { id: "sym_sterile_eo",  label: "Sterile — Ethylene Oxide",        placeholder: "e.g. Added" },
          { id: "sym_sterile_r",   label: "Sterile — Radiation",             placeholder: "e.g. Added" },
          { id: "sym_sterile_a",   label: "Sterile — Aseptic Processing",    placeholder: "e.g. Added" },
        ],
      },
      {
        id: "sym_use_handling",
        name: "Use & handling",
        attributes: [
          { id: "sym_single_use",     label: "Do Not Re-use",                      placeholder: "e.g. Added / Removed" },
          { id: "sym_no_damaged",     label: "Do Not Use If Package Is Damaged",   placeholder: "e.g. Added / Removed" },
          { id: "sym_keep_heat",      label: "Keep away from heat",               placeholder: "e.g. Added" },
          { id: "sym_keep_dry",       label: "Keep dry",                          placeholder: "e.g. Added" },
          { id: "sym_fragile",        label: "Fragile — handle with care",        placeholder: "e.g. Added / Removed" },
          { id: "sym_temp_upper",     label: "Temperature limit — upper",         placeholder: "e.g. +25°C → +30°C" },
          { id: "sym_temp_lower",     label: "Temperature limit — lower",         placeholder: "e.g. -10°C → -20°C" },
          { id: "sym_do_not_reuse",   label: "Do Not Resterilize",               placeholder: "e.g. Added" },
          { id: "sym_phthalate_free", label: "Phthalate free",                   placeholder: "e.g. Added" },
        ],
      },
      {
        id: "sym_information",
        name: "Information & IFU",
        attributes: [
          { id: "sym_consult_ifu", label: "Consult Instructions for Use",  placeholder: "e.g. Added / Removed" },
          { id: "sym_eifu",        label: "eIFU symbol",                   placeholder: "e.g. Added — electronic IFU" },
          { id: "sym_manufacturer",label: "Manufacturer symbol",           placeholder: "e.g. Repositioned" },
          { id: "sym_caution",     label: "Caution / Exclamation Mark",    placeholder: "e.g. Added / Removed" },
        ],
      },
      {
        id: "sym_traceability",
        name: "Dates & traceability symbols",
        attributes: [
          { id: "sym_mfg_date",   label: "Date of Manufacture",                placeholder: "e.g. Repositioned / size change" },
          { id: "sym_use_by",     label: "Use By Date (Expiry)",               placeholder: "e.g. Added / Removed" },
          { id: "sym_batch_code", label: "Lot / Batch Number",                 placeholder: "e.g. Repositioned" },
          { id: "sym_cat_number", label: "Catalogue / Reference Number",       placeholder: "e.g. Repositioned" },
          { id: "sym_ref",        label: "REF symbol",                         placeholder: "e.g. Repositioned / size change" },
        ],
      },
      {
        id: "sym_material",
        name: "Material & MR safety",
        attributes: [
          { id: "sym_latex_free",      label: "Latex free",                    placeholder: "e.g. Added" },
          { id: "sym_dehp_free",       label: "DEHP free",                     placeholder: "e.g. Added" },
          { id: "sym_pvc_free",        label: "PVC free",                      placeholder: "e.g. Added" },
          { id: "sym_mri_safe",        label: "MR Safe",                       placeholder: "e.g. Added" },
          { id: "sym_mri_conditional", label: "MR Conditional",               placeholder: "e.g. Changed from MR Safe" },
          { id: "sym_recyclable",      label: "Recyclable",                    placeholder: "e.g. Added" },
          { id: "sym_contains_latex",  label: "Contains natural rubber latex", placeholder: "e.g. Added" },
        ],
      },
      // ── Images (img_ prefix → Add/Remove/Modify, show expected value/upload) ─
      {
        id: "img_logo",
        name: "Company / brand logo",
        attributes: [
          { id: "logo_change", label: "Logo change", placeholder: "e.g. logo added / removed / updated" },
        ],
      },
      {
        id: "img_device",
        name: "Medical device image",
        attributes: [
          { id: "device_img_change", label: "Device image change", placeholder: "e.g. product illustration added / removed / updated" },
        ],
      },
      {
        id: "img_diagram",
        name: "Diagrams & illustrations",
        attributes: [
          { id: "diag_change", label: "Diagram / illustration change", placeholder: "e.g. usage diagram added / removed / updated" },
        ],
      },
      {
        id: "img_background",
        name: "Background & general",
        attributes: [
          { id: "bg_colour",           label: "Background colour change",  placeholder: "e.g. all sizes text area, full label background" },
          { id: "bg_img_change",       label: "Background image change",   placeholder: "e.g. header region, sizes panel, entire label" },
          { id: "bg_watermark_change", label: "Watermark change",          placeholder: "e.g. centre of label, all text areas" },
          { id: "bg_border_change",    label: "Border / frame change",     placeholder: "e.g. outer border, specific panel boundary" },
        ],
      },
    ],
  },

  barcode: {
    id: "barcode",
    label: "Barcode",
    groups: [
      {
        id: "bc_items",
        name: "Barcode items",
        attributes: [
          { id: "bc_1d_barcode", label: "1D Barcode", placeholder: "" },
        ],
      },
      {
        id: "bc_type",
        name: "Barcode type & format",
        attributes: [
          { id: "bc_type_change", label: "Barcode type",       placeholder: "e.g. 1D linear → DataMatrix" },
          { id: "bc_symbology",   label: "Barcode symbology",  placeholder: "e.g. Code 128 → GS1-128" },
          { id: "bc_udi_format",  label: "UDI format",         placeholder: "e.g. GS1 / HIBC / ICCBBA" },
          { id: "bc_added",       label: "Barcode added",      placeholder: "e.g. DataMatrix added to label" },
          { id: "bc_removed",     label: "Barcode removed",    placeholder: "e.g. 1D barcode removed" },
        ],
      },
      {
        id: "bc_content",
        name: "Encoded content",
        attributes: [
          { id: "bc_gtin",      label: "GTIN encoded value",         placeholder: "e.g. 00840002600017 → 00840002600018" },
          { id: "bc_lot",       label: "LOT encoded value",          placeholder: "e.g. AI (10) format change" },
          { id: "bc_expiry",    label: "Expiry date encoded",        placeholder: "e.g. AI (17) format YYMMDD → YYYYMMDD" },
          { id: "bc_serial",    label: "Serial number encoded",      placeholder: "e.g. AI (21) added to DataMatrix" },
          { id: "bc_hri",       label: "HRI (human-readable text)",  placeholder: "e.g. (10)SAMPLE → (10)LOT001" },
          { id: "bc_hri_state", label: "HRI — present / absent",     placeholder: "e.g. HRI removed from below barcode" },
        ],
      },
      {
        id: "bc_physical",
        name: "Physical specification",
        attributes: [
          { id: "bc_x_dimension", label: "X-dimension",              placeholder: "e.g. 0.25mm → 0.33mm" },
          { id: "bc_quiet_zone",  label: "Quiet zone",               placeholder: "e.g. increased to 10x" },
          { id: "bc_size",        label: "Barcode size",             placeholder: "e.g. 20mm x 10mm → 25mm x 12mm" },
          { id: "bc_iso_grade",   label: "ISO grading requirement",  placeholder: "e.g. ISO 15416 Grade C → Grade B" },
          { id: "bc_colour",      label: "Barcode colour",           placeholder: "e.g. Black → Dark Blue" },
        ],
      },
      {
        id: "bc_position",
        name: "Position & DataMatrix",
        attributes: [
          { id: "bc_second_barcode", label: "Second barcode added",  placeholder: "e.g. QR code added alongside DataMatrix" },
          { id: "dm_datamatrix",     label: "DataMatrix",            placeholder: "" },
        ],
      },
    ],
  },
};

export const LRF_CATEGORY_ORDER: LRFCategoryId[] = ["text", "graphics", "barcode"];

/** Flat lookup: attrId → { label, categoryId } — used for finding classification */
export const LRF_ATTRIBUTE_LOOKUP: Record<string, { label: string; categoryId: LRFCategoryId }> =
  LRF_CATEGORY_ORDER.reduce((acc, catId) => {
    for (const group of LRF_CATEGORIES[catId].groups) {
      for (const attr of group.attributes) {
        acc[attr.id] = { label: attr.label, categoryId: catId };
      }
    }
    return acc;
  }, {} as Record<string, { label: string; categoryId: LRFCategoryId }>);

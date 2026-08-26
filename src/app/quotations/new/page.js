"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "../../lib/supabase";


/* ============================================================
   PRODUCT CATALOG
============================================================ */

const PRODUCT_CATALOG = [
  {
    key: "vinyl",
    name: "ไวนิล",
    calculation: "sqm",
    unit: "ตร.ม.",
    unitPrice: 150,
  },

  {
    key: "uv_sticker",
    name: "สติกเกอร์พิมพ์ UV",
    calculation: "sqm",
    unit: "ตร.ม.",
    unitPrice: 650,
  },

  {
    key: "lightbox",
    name: "ตู้ไฟสี่เหลี่ยม",
    calculation: "sqm",
    unit: "ตร.ม.",
    unitPrice: 7500,
  },

  {
    key: "paswood10",
    name: "อักษรพาสวู๊ด 10 มม.",
    calculation: "height_inch",
    unit: "นิ้ว",
    unitPrice: 15,
  },

  {
    key: "zinc_frontlight",
    name: "อักษรซิ้งค์ไฟออกหน้า",
    calculation: "height_inch",
    unit: "นิ้ว",
    unitPrice: 150,
  },

  {
    key: "custom",
    name: "กำหนดเอง",
    calculation: "normal",
    unit: "งาน",
    unitPrice: 0,
  },
];


/* ============================================================
   NEW ITEM
============================================================ */

function createNewItem() {
  return {
    product_key: "vinyl",
    description: "ไวนิล",
    size: "",
    quantity: 1,
    unit: "ตร.ม.",
    unit_price: 150,
    amount: 0,
  };
}


/* ============================================================
   PAGE
============================================================ */

export default function NewQuotationPage() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);


  /* ============================================================
     CUSTOMER STATE
  ============================================================ */

  const [
    customers,
    setCustomers,
  ] = useState([]);

  const [
    customerId,
    setCustomerId,
  ] = useState("");

  const [
    customerSearch,
    setCustomerSearch,
  ] = useState("");

  const [
    showCustomerResults,
    setShowCustomerResults,
  ] = useState(false);

  const [
    showCustomerModal,
    setShowCustomerModal,
  ] = useState(false);

  const [
    savingCustomer,
    setSavingCustomer,
  ] = useState(false);

  const [
    newCustomer,
    setNewCustomer,
  ] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
  });


  /* ============================================================
     QUOTATION STATE
  ============================================================ */

  const [
    projectName,
    setProjectName,
  ] = useState("");

  const [
    note,
    setNote,
  ] = useState("");

  const [
    items,
    setItems,
  ] = useState([
    createNewItem(),
  ]);


  /* ============================================================
     LOAD PAGE
  ============================================================ */

  useEffect(() => {
    loadPage();
  }, []);


  async function loadPage() {
    setLoading(true);

    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    await loadCustomers();

    setLoading(false);
  }


  async function loadCustomers() {
    const {
      data,
      error,
    } =
      await supabase
        .from("customers")
        .select(`
          id,
          customer_code,
          company_name,
          contact_name,
          phone,
          email,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (error) {
      console.error(
        "load customers:",
        error
      );

      alert(
        "โหลดข้อมูลลูกค้าไม่สำเร็จ: " +
          error.message
      );

      return [];
    }

    const list =
      data || [];

    setCustomers(list);

    return list;
  }


  /* ============================================================
     CUSTOMER HELPERS
  ============================================================ */

  function customerDisplayName(
    customer
  ) {
    return (
      customer?.company_name ||
      customer?.contact_name ||
      "ไม่ระบุชื่อ"
    );
  }


  function customerLabel(
    customer
  ) {
    const code =
      customer?.customer_code ||
      "-";

    return `${code} - ${customerDisplayName(
      customer
    )}`;
  }


  const selectedCustomer =
    useMemo(() => {
      return (
        customers.find(
          (customer) =>
            customer.id ===
            customerId
        ) || null
      );
    }, [
      customers,
      customerId,
    ]);


  const filteredCustomers =
    useMemo(() => {
      const keyword =
        customerSearch
          .trim()
          .toLowerCase();

      if (!keyword) {
        return customers.slice(
          0,
          10
        );
      }

      return customers.filter(
        (customer) => {
          const text = [
            customer.customer_code,
            customer.company_name,
            customer.contact_name,
            customer.phone,
            customer.email,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return text.includes(
            keyword
          );
        }
      );
    }, [
      customers,
      customerSearch,
    ]);


  function selectCustomer(
    customer
  ) {
    setCustomerId(
      customer.id
    );

    setCustomerSearch(
      customerLabel(customer)
    );

    setShowCustomerResults(
      false
    );
  }


  function clearCustomer() {
    setCustomerId("");
    setCustomerSearch("");
    setShowCustomerResults(
      true
    );
  }


  /* ============================================================
     CUSTOMER CODE
  ============================================================ */

  function generateNextCustomerCode(
    list
  ) {
    let maxNumber = 0;

    for (
      const customer of list
    ) {
      const code =
        String(
          customer.customer_code ||
            ""
        )
          .trim()
          .toUpperCase();

      const match =
        code.match(
          /^C(\d+)$/
        );

      if (!match) {
        continue;
      }

      const number =
        Number(match[1]);

      if (
        Number.isFinite(number) &&
        number > maxNumber
      ) {
        maxNumber =
          number;
      }
    }

    const next =
      maxNumber + 1;

    return `C${String(
      next
    ).padStart(3, "0")}`;
  }


  /* ============================================================
     QUICK ADD CUSTOMER
  ============================================================ */

  function updateNewCustomer(
    field,
    value
  ) {
    setNewCustomer(
      (prev) => ({
        ...prev,
        [field]: value,
      })
    );
  }


  function openCustomerModal() {
    setNewCustomer({
      company_name: "",
      contact_name: "",
      phone: "",
      email: "",
    });

    setShowCustomerModal(
      true
    );
  }


  async function saveNewCustomer() {
    if (savingCustomer) {
      return;
    }

    const companyName =
      newCustomer.company_name
        .trim();

    const contactName =
      newCustomer.contact_name
        .trim();

    if (
      !companyName &&
      !contactName
    ) {
      alert(
        "กรุณากรอกชื่อบริษัทหรือลูกค้า"
      );

      return;
    }

    setSavingCustomer(true);

    try {
      const latestCustomers =
        await loadCustomers();

      const customerCode =
        generateNextCustomerCode(
          latestCustomers
        );

      const {
        data,
        error,
      } =
        await supabase
          .from("customers")
          .insert({
            customer_code:
              customerCode,

            company_name:
              companyName ||
              null,

            contact_name:
              contactName ||
              companyName ||
              null,

            phone:
              newCustomer.phone
                .trim() ||
              null,

            email:
              newCustomer.email
                .trim() ||
              null,
          })
          .select(`
            id,
            customer_code,
            company_name,
            contact_name,
            phone,
            email,
            created_at
          `)
          .single();

      if (error) {
        throw error;
      }

      setCustomers(
        (prev) => [
          data,
          ...prev.filter(
            (item) =>
              item.id !== data.id
          ),
        ]
      );

      selectCustomer(data);

      setShowCustomerModal(
        false
      );

      alert(
        `เพิ่มลูกค้า ${customerCode} เรียบร้อยแล้ว`
      );
    } catch (error) {
      console.error(
        "save customer:",
        error
      );

      alert(
        "เพิ่มลูกค้าไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );
    } finally {
      setSavingCustomer(
        false
      );
    }
  }


  /* ============================================================
     PRODUCT HELPERS
  ============================================================ */

  function getProduct(
    key
  ) {
    return (
      PRODUCT_CATALOG.find(
        (product) =>
          product.key === key
      ) ||
      PRODUCT_CATALOG[
        PRODUCT_CATALOG.length -
          1
      ]
    );
  }


  /* ============================================================
     SIZE PARSER
  ============================================================ */

  function parseCmSize(
    text
  ) {
    const raw =
      String(text || "")
        .trim()
        .toLowerCase()
        .replace(
          /ซม\.?/g,
          ""
        )
        .replace(
          /cm/g,
          ""
        )
        .replace(
          /×/g,
          "x"
        )
        .replace(
          /\*/g,
          "x"
        )
        .replace(
          /\s+/g,
          ""
        );

    const match =
      raw.match(
        /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/
      );

    if (!match) {
      return null;
    }

    const width =
      Number(match[1]);

    const height =
      Number(match[2]);

    if (
      !Number.isFinite(
        width
      ) ||
      !Number.isFinite(
        height
      ) ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }

    return {
      width,
      height,
    };
  }


  function parseHeightInch(
    text
  ) {
    const raw =
      String(text || "")
        .trim()
        .replace(
          /นิ้ว/g,
          ""
        )
        .replace(
          /"/g,
          ""
        )
        .trim();

    const value =
      Number(raw);

    if (
      !Number.isFinite(
        value
      ) ||
      value <= 0
    ) {
      return 0;
    }

    return value;
  }


  /* ============================================================
     MONEY
  ============================================================ */

  function money(value) {
    return new Intl.NumberFormat(
      "th-TH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(
      Number(value || 0)
    );
  }


  /* ============================================================
     CALCULATE ITEM
  ============================================================ */

  function calculateItem(
    item
  ) {
    const product =
      getProduct(
        item.product_key
      );

    const qty =
      Number(
        item.quantity
      ) || 0;

    const price =
      Number(
        item.unit_price
      ) || 0;


    /* --------------------------------------------
       SQM
    -------------------------------------------- */

    if (
      product.calculation ===
      "sqm"
    ) {
      const size =
        parseCmSize(
          item.size
        );

      if (!size) {
        return {
          amount: 0,
          calculationText:
            "กรอกขนาด เช่น 200 x 100 ซม.",
        };
      }

      const area =
        (
          size.width *
          size.height
        ) /
        10000;

      const amount =
        area *
        qty *
        price;

      return {
        amount,
        area,

        calculationText:
          `${area.toFixed(
            2
          )} ตร.ม. × ${qty} × ฿${money(
            price
          )}`,
      };
    }


    /* --------------------------------------------
       HEIGHT INCH
    -------------------------------------------- */

    if (
      product.calculation ===
      "height_inch"
    ) {
      const height =
        parseHeightInch(
          item.size
        );

      if (!height) {
        return {
          amount: 0,

          calculationText:
            "กรอกความสูง เช่น 20 นิ้ว",
        };
      }

      /*
        quantity = จำนวนตัวอักษร

        เช่น
        สูง 20 นิ้ว
        จำนวน 10 ตัว
        พาสวู๊ด 15 บาท/นิ้ว

        20 × 10 × 15
        = 3,000 บาท
      */

      const amount =
        height *
        qty *
        price;

      return {
        amount,
        height,

        calculationText:
          `${height} นิ้ว × ${qty} ตัว × ฿${money(
            price
          )}`,
      };
    }


    /* --------------------------------------------
       NORMAL
    -------------------------------------------- */

    return {
      amount:
        qty * price,

      calculationText:
        `${qty} × ฿${money(
          price
        )}`,
    };
  }


  function recalculateItem(
    item
  ) {
    const result =
      calculateItem(item);

    return {
      ...item,

      amount:
        Number(
          result.amount ||
            0
        ),
    };
  }


  /* ============================================================
     CHANGE PRODUCT
  ============================================================ */

  function changeProduct(
    index,
    key
  ) {
    const product =
      getProduct(key);

    setItems(
      (oldItems) => {
        const next =
          [...oldItems];

        next[index] =
          recalculateItem({
            ...next[index],

            product_key:
              key,

            description:
              key === "custom"
                ? ""
                : product.name,

            size: "",

            quantity: 1,

            unit:
              product.unit,

            unit_price:
              product.unitPrice,
          });

        return next;
      }
    );
  }


  /* ============================================================
     UPDATE ITEM
  ============================================================ */

  function updateItem(
    index,
    field,
    value
  ) {
    setItems(
      (oldItems) => {
        const next =
          [...oldItems];

        next[index] =
          recalculateItem({
            ...next[index],

            [field]:
              value,
          });

        return next;
      }
    );
  }


  /* ============================================================
     ADD / REMOVE ITEM
  ============================================================ */

  function addItem() {
    setItems(
      (oldItems) => [
        ...oldItems,
        createNewItem(),
      ]
    );
  }


  function removeItem(
    index
  ) {
    if (
      items.length === 1
    ) {
      return;
    }

    setItems(
      (oldItems) =>
        oldItems.filter(
          (
            _,
            itemIndex
          ) =>
            itemIndex !==
            index
        )
    );
  }


  /* ============================================================
     TOTAL
  ============================================================ */

  const subtotal =
    useMemo(() => {
      return items.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.amount ||
              0
          ),
        0
      );
    }, [items]);


  /* ============================================================
     SAVE QUOTATION
  ============================================================ */

  async function createQuotation() {
    if (saving) {
      return;
    }

    if (!customerId) {
      alert(
        "กรุณาเลือกลูกค้า"
      );

      return;
    }

    if (
      !projectName.trim()
    ) {
      alert(
        "กรุณากรอกชื่อโครงการ / งาน"
      );

      return;
    }

    const validItems =
      items.filter(
        (item) =>
          item.description
            .trim() &&
          Number(
            item.quantity
          ) > 0
      );

    if (
      validItems.length ===
      0
    ) {
      alert(
        "กรุณากรอกรายการสินค้า / บริการอย่างน้อย 1 รายการ"
      );

      return;
    }


    /* ==========================================================
       VALIDATE ITEM
    ========================================================== */

    for (
      let index = 0;
      index <
      validItems.length;
      index++
    ) {
      const item =
        validItems[index];

      const product =
        getProduct(
          item.product_key
        );


      if (
        product.calculation ===
          "sqm" &&
        !parseCmSize(
          item.size
        )
      ) {
        alert(
          `รายการที่ ${
            index + 1
          }: กรุณากรอกขนาด เช่น 200 x 100`
        );

        return;
      }


      if (
        product.calculation ===
          "height_inch" &&
        !parseHeightInch(
          item.size
        )
      ) {
        alert(
          `รายการที่ ${
            index + 1
          }: กรุณากรอกความสูง เช่น 20 นิ้ว`
        );

        return;
      }
    }


    setSaving(true);

    let quotationId =
      null;


    try {
      const now =
        new Date();

      const year =
        now.getFullYear();

      const random =
        Math.floor(
          100000 +
            Math.random() *
              900000
        );

      const quotationNo =
        `QT-${year}-${random}`;


      /* ========================================================
         CREATE QUOTATION
      ======================================================== */

      const {
        data:
          quotation,

        error:
          quotationError,
      } =
        await supabase
          .from(
            "quotations"
          )
          .insert({
            customer_id:
              customerId,

            quotation_no:
              quotationNo,

            project_name:
              projectName.trim(),

            quotation_date:
              now
                .toISOString()
                .slice(
                  0,
                  10
                ),

            valid_days: 30,

            subtotal:
              subtotal,

            discount: 0,

            vat_percent: 0,

            vat_amount: 0,

            grand_total:
              subtotal,

            status:
              "draft",

            note:
              note.trim() ||
              null,
          })
          .select()
          .single();


      if (
        quotationError
      ) {
        throw quotationError;
      }


      quotationId =
        quotation.id;


      /* ========================================================
         CREATE ITEMS
      ======================================================== */

      const quotationItems =
        validItems.map(
          (
            item,
            index
          ) => {
            const calculated =
              calculateItem(
                item
              );

            return {
              quotation_id:
                quotation.id,

              description:
                item.description
                  .trim(),

              size:
                item.size
                  .trim() ||
                null,

              quantity:
                Number(
                  item.quantity
                ),

              unit:
                item.unit
                  .trim() ||
                "งาน",

              unit_price:
                Number(
                  item.unit_price
                ),

              amount:
                Number(
                  calculated.amount ||
                    0
                ),

              sort_order:
                index + 1,
            };
          }
        );


      const {
        error:
          itemError,
      } =
        await supabase
          .from(
            "quotation_items"
          )
          .insert(
            quotationItems
          );


      if (itemError) {
        throw itemError;
      }


      alert(
        "สร้างใบเสนอราคาเรียบร้อยแล้ว\n" +
          quotationNo
      );


      router.push(
        `/quotations/${quotation.id}`
      );
    } catch (error) {
      console.error(
        "create quotation:",
        error
      );


      /* ========================================================
         REMOVE HEADER IF ITEM INSERT FAILED
      ======================================================== */

      if (
        quotationId
      ) {
        await supabase
          .from(
            "quotations"
          )
          .delete()
          .eq(
            "id",
            quotationId
          );
      }


      alert(
        "สร้างใบเสนอราคาไม่สำเร็จ: " +
          (
            error?.message ||
            "เกิดข้อผิดพลาด"
          )
      );
    } finally {
      setSaving(false);
    }
  }


  /* ============================================================
     LOADING
  ============================================================ */

  if (loading) {
    return (
      <main
        style={
          pageStyle
        }
      >
        <div
          style={
            containerStyle
          }
        >
          <div
            style={
              loadingStyle
            }
          >
            กำลังโหลดข้อมูล...
          </div>
        </div>
      </main>
    );
  }


  /* ============================================================
     PAGE
  ============================================================ */

  return (
    <>
      <main
        style={
          pageStyle
        }
      >
        <div
          style={
            containerStyle
          }
        >

          {/* =====================================================
              HEADER
          ===================================================== */}

          <div
            style={
              headerStyle
            }
          >
            <div>
              <h1
                style={
                  titleStyle
                }
              >
                สร้างใบเสนอราคา
              </h1>

              <p
                style={
                  subtitleStyle
                }
              >
                ระบบคำนวณราคางานป้ายอัตโนมัติ
              </p>
            </div>


            <div
              style={
                buttonRow
              }
            >
              <button
                type="button"

                onClick={() =>
                  router.push(
                    "/quotations/list"
                  )
                }

                style={
                  secondaryButton
                }
              >
                ← รายการใบเสนอราคา
              </button>


              <button
                type="button"

                onClick={() =>
                  router.push("/")
                }

                style={
                  secondaryButton
                }
              >
                Dashboard
              </button>
            </div>
          </div>


          {/* =====================================================
              QUOTATION INFO
          ===================================================== */}

          <section
            style={
              cardStyle
            }
          >
            <div
              style={
                sectionTitle
              }
            >
              ข้อมูลใบเสนอราคา
            </div>


            <div
              style={
                formGrid
              }
            >

              {/* =================================================
                  CUSTOMER
              ================================================= */}

              <div>
                <div
                  style={
                    customerLabelRow
                  }
                >
                  <label
                    style={{
                      ...labelStyle,
                      marginBottom:
                        0,
                    }}
                  >
                    ลูกค้า *
                  </label>


                  <button
                    type="button"

                    onClick={
                      openCustomerModal
                    }

                    style={
                      miniAddButton
                    }
                  >
                    + เพิ่มลูกค้าใหม่
                  </button>
                </div>


                <div
                  style={
                    customerPicker
                  }
                >
                  <input
                    value={
                      customerSearch
                    }

                    onFocus={() =>
                      setShowCustomerResults(
                        true
                      )
                    }

                    onChange={(
                      event
                    ) => {
                      setCustomerSearch(
                        event.target
                          .value
                      );

                      setCustomerId(
                        ""
                      );

                      setShowCustomerResults(
                        true
                      );
                    }}

                    placeholder="ค้นหารหัสลูกค้า / บริษัท / ผู้ติดต่อ / โทรศัพท์"

                    style={
                      customerSearchInput
                    }
                  />


                  {selectedCustomer && (
                    <button
                      type="button"

                      onClick={
                        clearCustomer
                      }

                      style={
                        clearCustomerButton
                      }
                    >
                      ×
                    </button>
                  )}


                  {showCustomerResults &&
                    !selectedCustomer && (
                      <div
                        style={
                          customerDropdown
                        }
                      >
                        {filteredCustomers.length ===
                        0 ? (
                          <div
                            style={
                              customerEmpty
                            }
                          >
                            ไม่พบลูกค้า

                            <button
                              type="button"

                              onClick={
                                openCustomerModal
                              }

                              style={
                                inlineAddCustomerButton
                              }
                            >
                              + เพิ่มลูกค้าใหม่
                            </button>
                          </div>
                        ) : (
                          filteredCustomers.map(
                            (
                              customer
                            ) => (
                              <button
                                key={
                                  customer.id
                                }

                                type="button"

                                onClick={() =>
                                  selectCustomer(
                                    customer
                                  )
                                }

                                style={
                                  customerResultButton
                                }
                              >
                                <strong>
                                  {
                                    customer.customer_code
                                  }
                                </strong>

                                <span>
                                  {customerDisplayName(
                                    customer
                                  )}
                                </span>

                                {customer.phone && (
                                  <small
                                    style={
                                      customerSecondary
                                    }
                                  >
                                    {
                                      customer.phone
                                    }
                                  </small>
                                )}
                              </button>
                            )
                          )
                        )}
                      </div>
                    )}
                </div>


                {selectedCustomer && (
                  <div
                    style={
                      selectedCustomerCard
                    }
                  >
                    <strong>
                      {
                        selectedCustomer.customer_code
                      }
                    </strong>

                    <span>
                      {customerDisplayName(
                        selectedCustomer
                      )}
                    </span>

                    {selectedCustomer.phone && (
                      <span>
                        โทร{" "}
                        {
                          selectedCustomer.phone
                        }
                      </span>
                    )}
                  </div>
                )}
              </div>


              {/* =================================================
                  PROJECT
              ================================================= */}

              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  ชื่อโครงการ / งาน *
                </label>


                <input
                  value={
                    projectName
                  }

                  onChange={(
                    event
                  ) =>
                    setProjectName(
                      event.target
                        .value
                    )
                  }

                  placeholder="เช่น ป้ายหน้าร้าน"

                  style={
                    inputStyle
                  }
                />
              </div>


              {/* =================================================
                  NOTE
              ================================================= */}

              <div
                style={{
                  gridColumn:
                    "1 / -1",
                }}
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  หมายเหตุ
                </label>


                <textarea
                  value={note}

                  onChange={(
                    event
                  ) =>
                    setNote(
                      event.target
                        .value
                    )
                  }

                  rows={3}

                  style={{
                    ...inputStyle,

                    resize:
                      "vertical",
                  }}
                />
              </div>
            </div>
          </section>


          {/* =====================================================
              ITEMS
          ===================================================== */}

          <section
            style={{
              ...cardStyle,

              marginTop:
                "20px",
            }}
          >
            <div
              style={
                sectionHeader
              }
            >
              <div>
                <div
                  style={
                    sectionTitle
                  }
                >
                  รายการสินค้า / บริการ
                </div>

                <div
                  style={
                    sectionSubtitle
                  }
                >
                  ระบบเลือกหน่วยและราคามาตรฐานให้อัตโนมัติ
                </div>
              </div>


              <button
                type="button"

                onClick={
                  addItem
                }

                style={
                  addButton
                }
              >
                + เพิ่มรายการ
              </button>
            </div>


            <div
              style={{
                overflowX:
                  "auto",
              }}
            >
              <table
                style={
                  tableStyle
                }
              >
                <thead>
                  <tr>
                    <th
                      style={
                        thStyle
                      }
                    >
                      ลำดับ
                    </th>

                    <th
                      style={
                        thStyle
                      }
                    >
                      ประเภทงาน
                    </th>

                    <th
                      style={
                        thStyle
                      }
                    >
                      รายละเอียด
                    </th>

                    <th
                      style={
                        thStyle
                      }
                    >
                      ขนาด / ความสูง
                    </th>

                    <th
                      style={
                        thStyle
                      }
                    >
                      จำนวน
                    </th>

                    <th
                      style={
                        thStyle
                      }
                    >
                      หน่วยราคา
                    </th>

                    <th
                      style={
                        thStyle
                      }
                    >
                      ราคา
                    </th>

                    <th
                      style={
                        thRight
                      }
                    >
                      จำนวนเงิน
                    </th>

                    <th
                      style={
                        thCenter
                      }
                    >
                      จัดการ
                    </th>
                  </tr>
                </thead>


                <tbody>
                  {items.map(
                    (
                      item,
                      index
                    ) => {
                      const product =
                        getProduct(
                          item.product_key
                        );

                      const calculation =
                        calculateItem(
                          item
                        );


                      return (
                        <tr
                          key={
                            index
                          }

                          style={{
                            borderTop:
                              "1px solid #e5e7eb",
                          }}
                        >
                          <td
                            style={
                              tdCenter
                            }
                          >
                            {index +
                              1}
                          </td>


                          {/* PRODUCT */}

                          <td
                            style={
                              tdStyle
                            }
                          >
                            <select
                              value={
                                item.product_key
                              }

                              onChange={(
                                event
                              ) =>
                                changeProduct(
                                  index,

                                  event
                                    .target
                                    .value
                                )
                              }

                              style={
                                tableInput
                              }
                            >
                              {PRODUCT_CATALOG.map(
                                (
                                  product
                                ) => (
                                  <option
                                    key={
                                      product.key
                                    }

                                    value={
                                      product.key
                                    }
                                  >
                                    {
                                      product.name
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </td>


                          {/* DESCRIPTION */}

                          <td
                            style={
                              tdStyle
                            }
                          >
                            <input
                              value={
                                item.description
                              }

                              disabled={
                                item.product_key !==
                                "custom"
                              }

                              onChange={(
                                event
                              ) =>
                                updateItem(
                                  index,

                                  "description",

                                  event
                                    .target
                                    .value
                                )
                              }

                              style={
                                tableInput
                              }
                            />
                          </td>


                          {/* SIZE */}

                          <td
                            style={
                              tdStyle
                            }
                          >
                            <input
                              value={
                                item.size
                              }

                              onChange={(
                                event
                              ) =>
                                updateItem(
                                  index,

                                  "size",

                                  event
                                    .target
                                    .value
                                )
                              }

                              placeholder={
                                product.calculation ===
                                "sqm"
                                  ? "200 x 100"
                                  : product.calculation ===
                                    "height_inch"
                                  ? "20"
                                  : "-"
                              }

                              style={
                                tableInput
                              }
                            />


                            <div
                              style={
                                calculationHelp
                              }
                            >
                              {
                                calculation.calculationText
                              }
                            </div>
                          </td>


                          {/* QUANTITY */}

                          <td
                            style={
                              tdStyle
                            }
                          >
                            <input
                              type="number"

                              min="1"

                              value={
                                item.quantity
                              }

                              onChange={(
                                event
                              ) =>
                                updateItem(
                                  index,

                                  "quantity",

                                  event
                                    .target
                                    .value
                                )
                              }

                              style={
                                tableInput
                              }
                            />
                          </td>


                          {/* UNIT */}

                          <td
                            style={
                              tdCenter
                            }
                          >
                            {
                              item.unit
                            }
                          </td>


                          {/* UNIT PRICE */}

                          <td
                            style={
                              tdStyle
                            }
                          >
                            <input
                              type="number"

                              min="0"

                              step="0.01"

                              value={
                                item.unit_price
                              }

                              onChange={(
                                event
                              ) =>
                                updateItem(
                                  index,

                                  "unit_price",

                                  event
                                    .target
                                    .value
                                )
                              }

                              style={
                                tableInput
                              }
                            />


                            <div
                              style={
                                priceHelp
                              }
                            >
                              บาท/
                              {
                                item.unit
                              }
                            </div>
                          </td>


                          {/* AMOUNT */}

                          <td
                            style={
                              tdRight
                            }
                          >
                            ฿
                            {money(
                              item.amount
                            )}
                          </td>


                          {/* DELETE */}

                          <td
                            style={
                              tdCenter
                            }
                          >
                            <button
                              type="button"

                              onClick={() =>
                                removeItem(
                                  index
                                )
                              }

                              disabled={
                                items.length ===
                                1
                              }

                              style={
                                deleteButton
                              }
                            >
                              ลบ
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </section>


          {/* =====================================================
              PRICE GUIDE
          ===================================================== */}

          <section
            style={{
              ...cardStyle,

              marginTop:
                "20px",
            }}
          >
            <div
              style={
                priceGuide
              }
            >
              <strong>
                ราคามาตรฐาน
              </strong>

              <span>
                ไวนิล ฿150/ตร.ม.
              </span>

              <span>
                สติกเกอร์พิมพ์ UV ฿650/ตร.ม.
              </span>

              <span>
                ตู้ไฟสี่เหลี่ยม ฿7,500/ตร.ม.
              </span>

              <span>
                พาสวู๊ด 10 มม. ฿15/นิ้ว
              </span>

              <span>
                ซิ้งค์ไฟออกหน้า ฿150/นิ้ว
              </span>
            </div>
          </section>


          {/* =====================================================
              TOTAL
          ===================================================== */}

          <section
            style={{
              ...cardStyle,

              marginTop:
                "20px",
            }}
          >
            <div
              style={
                totalRow
              }
            >
              <span>
                ยอดรวม
              </span>

              <strong
                style={{
                  fontSize:
                    "30px",

                  color:
                    "#1d4ed8",
                }}
              >
                ฿
                {money(
                  subtotal
                )}
              </strong>
            </div>
          </section>


          {/* =====================================================
              SAVE
          ===================================================== */}

          <div
            style={
              saveArea
            }
          >
            <button
              type="button"

              onClick={() =>
                router.push(
                  "/quotations/list"
                )
              }

              style={
                secondaryButton
              }
            >
              ยกเลิก
            </button>


            <button
              type="button"

              disabled={
                saving
              }

              onClick={
                createQuotation
              }

              style={
                saveButton
              }
            >
              {saving
                ? "กำลังบันทึก..."
                : "บันทึกใบเสนอราคา"}
            </button>
          </div>
        </div>
      </main>


      {/* =========================================================
          CUSTOMER MODAL
      ========================================================= */}

      {showCustomerModal && (
        <div
          style={
            modalOverlay
          }
        >
          <div
            style={
              modalBox
            }
          >
            <div
              style={
                modalHeader
              }
            >
              <div>
                <h2
                  style={{
                    margin: 0,

                    fontSize:
                      "22px",
                  }}
                >
                  เพิ่มลูกค้าใหม่
                </h2>

                <div
                  style={{
                    color:
                      "#6b7280",

                    fontSize:
                      "13px",

                    marginTop:
                      "4px",
                  }}
                >
                  เพิ่มจากหน้าใบเสนอราคาได้ทันที
                </div>
              </div>


              <button
                type="button"

                onClick={() =>
                  setShowCustomerModal(
                    false
                  )
                }

                style={
                  closeModalButton
                }
              >
                ×
              </button>
            </div>


            <div
              style={
                modalBody
              }
            >
              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  บริษัท / ลูกค้า
                </label>

                <input
                  value={
                    newCustomer.company_name
                  }

                  onChange={(
                    event
                  ) =>
                    updateNewCustomer(
                      "company_name",

                      event.target
                        .value
                    )
                  }

                  placeholder="ชื่อบริษัท หรือลูกค้า"

                  style={
                    inputStyle
                  }
                />
              </div>


              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  ผู้ติดต่อ
                </label>

                <input
                  value={
                    newCustomer.contact_name
                  }

                  onChange={(
                    event
                  ) =>
                    updateNewCustomer(
                      "contact_name",

                      event.target
                        .value
                    )
                  }

                  placeholder="ชื่อผู้ติดต่อ"

                  style={
                    inputStyle
                  }
                />
              </div>


              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  โทรศัพท์
                </label>

                <input
                  value={
                    newCustomer.phone
                  }

                  onChange={(
                    event
                  ) =>
                    updateNewCustomer(
                      "phone",

                      event.target
                        .value
                    )
                  }

                  placeholder="เบอร์โทรศัพท์"

                  style={
                    inputStyle
                  }
                />
              </div>


              <div>
                <label
                  style={
                    labelStyle
                  }
                >
                  อีเมล
                </label>

                <input
                  type="email"

                  value={
                    newCustomer.email
                  }

                  onChange={(
                    event
                  ) =>
                    updateNewCustomer(
                      "email",

                      event.target
                        .value
                    )
                  }

                  placeholder="อีเมล"

                  style={
                    inputStyle
                  }
                />
              </div>
            </div>


            <div
              style={
                modalFooter
              }
            >
              <button
                type="button"

                onClick={() =>
                  setShowCustomerModal(
                    false
                  )
                }

                style={
                  secondaryButton
                }
              >
                ยกเลิก
              </button>


              <button
                type="button"

                disabled={
                  savingCustomer
                }

                onClick={
                  saveNewCustomer
                }

                style={
                  saveButton
                }
              >
                {savingCustomer
                  ? "กำลังเพิ่ม..."
                  : "เพิ่มลูกค้า"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


/* ============================================================
   STYLES
============================================================ */

const pageStyle = {
  minHeight: "100vh",

  background:
    "#f3f4f6",

  padding:
    "32px",

  color:
    "#111827",
};


const containerStyle = {
  maxWidth:
    "1500px",

  margin:
    "0 auto",
};


const headerStyle = {
  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",

  gap:
    "12px",

  flexWrap:
    "wrap",

  marginBottom:
    "20px",
};


const titleStyle = {
  margin: 0,

  fontSize:
    "32px",
};


const subtitleStyle = {
  color:
    "#6b7280",

  marginTop:
    "6px",
};


const buttonRow = {
  display:
    "flex",

  gap:
    "10px",

  flexWrap:
    "wrap",
};


const cardStyle = {
  background:
    "white",

  borderRadius:
    "12px",

  boxShadow:
    "0 2px 8px rgba(0,0,0,0.05)",

  overflow:
    "visible",
};


const sectionHeader = {
  borderBottom:
    "1px solid #e5e7eb",

  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "center",
};


const sectionTitle = {
  padding:
    "18px 20px",

  fontSize:
    "19px",

  fontWeight:
    "800",
};


const sectionSubtitle = {
  padding:
    "0 20px 16px",

  color:
    "#6b7280",

  fontSize:
    "13px",
};


const formGrid = {
  padding:
    "20px",

  display:
    "grid",

  gridTemplateColumns:
    "repeat(2, minmax(0, 1fr))",

  gap:
    "18px",
};


const labelStyle = {
  display:
    "block",

  marginBottom:
    "7px",

  color:
    "#374151",

  fontWeight:
    "700",

  fontSize:
    "13px",
};


const inputStyle = {
  width:
    "100%",

  boxSizing:
    "border-box",

  padding:
    "11px 12px",

  border:
    "1px solid #d1d5db",

  borderRadius:
    "8px",

  color:
    "#111827",

  background:
    "white",

  fontSize:
    "14px",
};


/* ============================================================
   CUSTOMER PICKER
============================================================ */

const customerLabelRow = {
  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "space-between",

  gap:
    "10px",

  marginBottom:
    "7px",
};


const miniAddButton = {
  border:
    "none",

  background:
    "transparent",

  color:
    "#2563eb",

  cursor:
    "pointer",

  fontWeight:
    "700",

  fontSize:
    "13px",
};


const customerPicker = {
  position:
    "relative",
};


const customerSearchInput = {
  ...inputStyle,

  paddingRight:
    "42px",
};


const clearCustomerButton = {
  position:
    "absolute",

  top:
    "50%",

  right:
    "10px",

  transform:
    "translateY(-50%)",

  border:
    "none",

  background:
    "transparent",

  fontSize:
    "22px",

  color:
    "#6b7280",

  cursor:
    "pointer",
};


const customerDropdown = {
  position:
    "absolute",

  top:
    "calc(100% + 5px)",

  left: 0,

  right: 0,

  maxHeight:
    "310px",

  overflowY:
    "auto",

  background:
    "white",

  border:
    "1px solid #d1d5db",

  borderRadius:
    "9px",

  boxShadow:
    "0 12px 30px rgba(0,0,0,0.12)",

  zIndex:
    100,
};


const customerResultButton = {
  width:
    "100%",

  padding:
    "12px 14px",

  border:
    "none",

  borderBottom:
    "1px solid #f3f4f6",

  background:
    "white",

  cursor:
    "pointer",

  textAlign:
    "left",

  display:
    "grid",

  gridTemplateColumns:
    "75px minmax(0,1fr) auto",

  gap:
    "10px",

  alignItems:
    "center",

  color:
    "#111827",
};


const customerSecondary = {
  color:
    "#6b7280",

  fontSize:
    "12px",
};


const customerEmpty = {
  padding:
    "18px",

  textAlign:
    "center",

  color:
    "#6b7280",
};


const inlineAddCustomerButton = {
  display:
    "block",

  margin:
    "12px auto 0",

  border:
    "none",

  background:
    "#2563eb",

  color:
    "white",

  borderRadius:
    "7px",

  padding:
    "8px 12px",

  fontWeight:
    "700",

  cursor:
    "pointer",
};


const selectedCustomerCard = {
  display:
    "flex",

  flexWrap:
    "wrap",

  gap:
    "8px 14px",

  marginTop:
    "8px",

  padding:
    "9px 11px",

  borderRadius:
    "8px",

  background:
    "#eff6ff",

  color:
    "#1e3a8a",

  fontSize:
    "12px",
};


/* ============================================================
   ITEMS
============================================================ */

const addButton = {
  marginRight:
    "20px",

  padding:
    "9px 13px",

  border:
    "none",

  borderRadius:
    "7px",

  background:
    "#2563eb",

  color:
    "white",

  fontWeight:
    "700",

  cursor:
    "pointer",
};


const tableStyle = {
  width:
    "100%",

  borderCollapse:
    "collapse",

  minWidth:
    "1350px",
};


const thStyle = {
  padding:
    "13px",

  textAlign:
    "left",

  fontSize:
    "13px",

  background:
    "#f9fafb",

  color:
    "#374151",
};


const thRight = {
  ...thStyle,

  textAlign:
    "right",
};


const thCenter = {
  ...thStyle,

  textAlign:
    "center",
};


const tdStyle = {
  padding:
    "10px",

  verticalAlign:
    "top",
};


const tdCenter = {
  padding:
    "10px",

  textAlign:
    "center",

  verticalAlign:
    "top",
};


const tdRight = {
  padding:
    "10px",

  textAlign:
    "right",

  fontWeight:
    "700",

  verticalAlign:
    "top",
};


const tableInput = {
  width:
    "100%",

  minWidth:
    "110px",

  boxSizing:
    "border-box",

  padding:
    "9px 10px",

  border:
    "1px solid #d1d5db",

  borderRadius:
    "7px",

  color:
    "#111827",

  background:
    "white",
};


const calculationHelp = {
  fontSize:
    "11px",

  color:
    "#6b7280",

  marginTop:
    "5px",

  minWidth:
    "150px",
};


const priceHelp = {
  fontSize:
    "11px",

  color:
    "#6b7280",

  marginTop:
    "5px",
};


const deleteButton = {
  padding:
    "7px 10px",

  border:
    "none",

  borderRadius:
    "6px",

  background:
    "#dc2626",

  color:
    "white",

  fontWeight:
    "700",

  cursor:
    "pointer",
};


const totalRow = {
  padding:
    "22px",

  display:
    "flex",

  justifyContent:
    "flex-end",

  alignItems:
    "center",

  gap:
    "30px",
};


const priceGuide = {
  padding:
    "18px 20px",

  display:
    "flex",

  flexWrap:
    "wrap",

  gap:
    "18px",

  fontSize:
    "13px",

  color:
    "#374151",
};


const saveArea = {
  marginTop:
    "20px",

  display:
    "flex",

  justifyContent:
    "flex-end",

  gap:
    "10px",
};


const saveButton = {
  padding:
    "11px 18px",

  border:
    "none",

  borderRadius:
    "8px",

  background:
    "#2563eb",

  color:
    "white",

  fontSize:
    "14px",

  fontWeight:
    "700",

  cursor:
    "pointer",
};


const secondaryButton = {
  padding:
    "10px 15px",

  border:
    "1px solid #d1d5db",

  borderRadius:
    "8px",

  background:
    "white",

  color:
    "#111827",

  fontWeight:
    "600",

  cursor:
    "pointer",
};


const loadingStyle = {
  background:
    "white",

  borderRadius:
    "12px",

  padding:
    "40px",

  textAlign:
    "center",
};


/* ============================================================
   MODAL
============================================================ */

const modalOverlay = {
  position:
    "fixed",

  inset: 0,

  zIndex:
    1000,

  background:
    "rgba(15,23,42,0.55)",

  display:
    "flex",

  alignItems:
    "center",

  justifyContent:
    "center",

  padding:
    "20px",
};


const modalBox = {
  width:
    "min(680px, 100%)",

  background:
    "white",

  borderRadius:
    "14px",

  boxShadow:
    "0 25px 70px rgba(0,0,0,0.25)",

  overflow:
    "hidden",
};


const modalHeader = {
  padding:
    "20px 22px",

  borderBottom:
    "1px solid #e5e7eb",

  display:
    "flex",

  justifyContent:
    "space-between",

  alignItems:
    "flex-start",
};


const closeModalButton = {
  border:
    "none",

  background:
    "transparent",

  fontSize:
    "26px",

  color:
    "#6b7280",

  cursor:
    "pointer",
};


const modalBody = {
  padding:
    "22px",

  display:
    "grid",

  gridTemplateColumns:
    "repeat(2, minmax(0,1fr))",

  gap:
    "16px",
};


const modalFooter = {
  padding:
    "16px 22px",

  borderTop:
    "1px solid #e5e7eb",

  display:
    "flex",

  justifyContent:
    "flex-end",

  gap:
    "10px",

  background:
    "#f9fafb",
};
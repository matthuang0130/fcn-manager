// src/utils/helpers.js

export const toHalfWidth = (str) => str ? str.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ') : "";

export const base64UrlEncode = (str) => {
    const base64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const base64UrlDecode = (str) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
};

export const copyToClipboard = (text) => {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed"; textArea.style.left = "-9999px"; textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus(); textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) { return false; }
};

export const formatToWan = (val) => {
    if (!val) return "0";
    const wan = val / 10000;
    return parseFloat(wan.toFixed(2)).toString(); 
};

export const normalizeTicker = (ticker) => {
  if (!ticker) return "";
  let normalized = toHalfWidth(ticker.toString()).toUpperCase();
  return normalized.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
};

export const unminifyData = (minified) => {
    if (!minified.v) return minified; 
    return {
        clientName: minified.n, 
        lastUpdated: minified.t, 
        prices: minified.m,
        sheetId: minified.s, 
        positions: minified.p.map((arr, index) => ({
            id: index, productName: arr[0], issuer: arr[1], nominal: arr[2], currency: arr[3],
            couponRate: arr[4], koLevel: arr[5], kiLevel: arr[6], strikeLevel: arr[7],
            strikeDate: arr[8], koObservationStartDate: arr[9], maturityDate: arr[10], tenor: arr[11],
            underlyings: arr[12].map(u => ({ ticker: u[0], entryPrice: u[1], memoryKO: !!u[2] })), 
            koType: "Daily", stepDownRate: 0, status: "Active", clientId: 'guest'
        }))
    };
};

export const parseRawDataToRows = (text) => {
    let rows = [];
    if (text.trim().startsWith('<') && text.includes('<table')) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const scripts = doc.querySelectorAll('script, style, noscript, iframe');
            scripts.forEach(n => n.remove());
            const trs = Array.from(doc.querySelectorAll('tr'));
            rows = trs.map(tr => 
                Array.from(tr.querySelectorAll('td, th')).map(cell => cell.innerText.trim())
            ).filter(row => row.some(cell => cell.length > 0));
        } catch (e) {
            console.error("HTML Parse Error", e);
            throw new Error("HTML 解析失敗，請確認連結內容");
        }
    } else {
        rows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
            const res = [];
            let entry = [];
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') { inQuotes = !inQuotes; }
                else if (char === ',' && !inQuotes) {
                    res.push(entry.join('').trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                    entry = [];
                } else { entry.push(char); }
            }
            res.push(entry.join('').trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            return res;
        });
    }
    return rows;
};

export const parsePortfolioRows = (rows) => {
    const garbageCheck = rows.slice(0, 5).some(r => 
        r.some(c => c && (c.includes('function') || c.includes('var ') || c.includes('<!DOCTYPE') || c.includes('window.')))
    );
    if (garbageCheck) {
        throw new Error("匯入失敗：資料包含程式碼片段。\n請確認您複製的是「發布到網路」的 CSV 連結，而非網頁編輯連結。");
    }

    if (rows.length < 2) throw new Error("資料內容為空或只有標題");
    
    const headerMap = {
        'client': ['client', '投資人', '客戶', 'account'],
        'product': ['product', 'name', '產品', '名稱', '商品', 'title', '標的名稱'],
        'issuer': ['issuer', '發行商', '上手'],
        'currency': ['currency', 'ccy', '幣別', '幣種'],
        'nominal': ['nominal', 'amount', '本金', '金額', 'notional'],
        'coupon': ['coupon', 'rate', '年息', '配息', 'interest'],
        'maturity': ['maturity', 'date', '到期', '到期日', 'end'],
        'ki': ['ki', 'barrier', '下限', 'knock-in'],
        'ko': ['ko', 'barrier', '上限', 'knock-out'],
        'strike': ['strike', '履約', '行權'],
        'underlyings': ['underlying', 'tickers', 'stocks', '標的', '連結標的', 'code'],
        'koObservation': ['observation', '觀察', 'start', '起始', 'ko date', 'begin'],
        'koType': ['type', '頻率', '型態', '觀察頻率'],
        'stepDownRate': ['step', '遞減', '遞減率']
    };

    let headerIdx = -1;
    let idx = {};

    const getIndex = (row, keys, excludeKeys = []) => {
        const lowerRow = row.map(c => c.toLowerCase());
        return lowerRow.findIndex(h => {
            const match = keys.some(k => h.includes(k));
            const notExcluded = excludeKeys.length === 0 || !excludeKeys.some(ek => h.includes(ek));
            return match && notExcluded;
        });
    };

    for(let i=0; i<Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if(!row.length) continue;
        
        const pIdx = getIndex(row, headerMap.product);
        
        if (pIdx > -1) {
            headerIdx = i;
            idx = {
                client: getIndex(row, headerMap.client),
                product: pIdx,
                issuer: getIndex(row, headerMap.issuer),
                currency: getIndex(row, headerMap.currency),
                nominal: getIndex(row, headerMap.nominal),
                coupon: getIndex(row, headerMap.coupon),
                maturity: getIndex(row, headerMap.maturity),
                ki: getIndex(row, headerMap.ki),
                ko: getIndex(row, headerMap.ko, ['observation', 'date', '日', '期', 'start']),
                strike: getIndex(row, headerMap.strike),
                underlyings: getIndex(row, headerMap.underlyings),
                koObservation: getIndex(row, headerMap.koObservation),
                koType: getIndex(row, headerMap.koType),
                stepDownRate: getIndex(row, headerMap.stepDownRate)
            };
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error(`找不到「產品名稱」欄位。\n\n請確認 Google Sheet 中包含「產品」或「名稱」欄位。\n(偵測到的第一列: ${rows[0] ? rows[0].join(',') : '空'})`);
    }

    const newClientsMap = new Map();
    const newPositions = [];

    const parsePercent = (val, defaultVal) => {
        if (!val) return defaultVal;
        const str = val.toString().replace(/[%]/g, '');
        const num = parseFloat(str);
        if (isNaN(num)) return defaultVal;
        if (num > 200) return defaultVal;
        return num < 5 ? num * 100 : num; 
    };

    const normalizeDate = (val) => {
        if (!val) return "";
        const str = val.toString().trim();
        const dashed = str.replace(/[\/\.]/g, '-');
        const parts = dashed.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                const y = parts[0];
                const m = parts[1].padStart(2, '0');
                const d = parts[2].padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
        }
        return dashed;
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 3 || !row[idx.product]) continue;

        const clientName = idx.client > -1 ? (row[idx.client] || '預設投資人') : '預設投資人';
        
        if (!newClientsMap.has(clientName)) {
            newClientsMap.set(clientName, `c_${Date.now()}_${Math.floor(Math.random()*1000)}`);
        }
        const clientId = newClientsMap.get(clientName);

        const underlyingRaw = idx.underlyings > -1 ? row[idx.underlyings] : "";
        const underlyings = [];
        if (underlyingRaw) {
            const pairs = underlyingRaw.split(/[\/;|\n]+/).map(s => s.trim());
            pairs.forEach(p => {
                const parts = p.split(/[:\s]+/).filter(Boolean);
                if (parts.length >= 1) {
                    const ticker = parts[0].toUpperCase();
                    let entryPrice = 100; 
                    let name = "";

                    if (parts.length >= 2) {
                        const priceStr = parts[parts.length-1].replace(/,/g, '');
                        const parsedPrice = parseFloat(priceStr);

                        if(!isNaN(parsedPrice)) {
                            entryPrice = parsedPrice;
                            if (parts.length > 2) {
                                name = parts.slice(1, parts.length - 1).join(' ');
                            }
                        }
                    }
                    underlyings.push({ ticker, entryPrice, name, memoryKO: false });
                }
            });
        }
        if (underlyings.length === 0) underlyings.push({ ticker: "UNKNOWN", entryPrice: 100, memoryKO: false });

        let rawKoType = idx.koType > -1 ? row[idx.koType] : "Daily";
        let koType = rawKoType.includes("月") || rawKoType.toLowerCase().includes("month") ? "Monthly" : "Daily";

        const pos = {
            id: Date.now() + i,
            clientId,
            productName: row[idx.product],
            issuer: idx.issuer > -1 ? row[idx.issuer] : "",
            currency: idx.currency > -1 ? row[idx.currency].toUpperCase() : "USD",
            nominal: idx.nominal > -1 ? (parseFloat(row[idx.nominal].replace(/,/g, '')) || 0) : 0,
            couponRate: idx.coupon > -1 ? (parseFloat(row[idx.coupon].replace(/[%]/g, '')) || 0) : 0,
            maturityDate: idx.maturity > -1 ? normalizeDate(row[idx.maturity]) : "",
            kiLevel: idx.ki > -1 ? parsePercent(row[idx.ki], 60) : 60,
            koLevel: idx.ko > -1 ? parsePercent(row[idx.ko], 100) : 100,
            strikeLevel: idx.strike > -1 ? parsePercent(row[idx.strike], 100) : 100,
            underlyings,
            strikeDate: "",
            koObservationStartDate: idx.koObservation > -1 ? normalizeDate(row[idx.koObservation]) : "",
            tenor: "",
            koType,
            stepDownRate: idx.stepDownRate > -1 ? parsePercent(row[idx.stepDownRate], 0) : 0,
            status: "Active"
        };
        newPositions.push(pos);
    }

    const newClients = Array.from(newClientsMap.entries()).map(([name, id]) => ({ id, name }));
    return { clients: newClients, positions: newPositions };
};
/** 轻量行政区划解析：从地址提取省/市，覆盖直辖市、省、自治区 */

const MUNICIPALITIES = ['北京市', '上海市', '天津市', '重庆市'] as const;

const AUTONOMOUS_REGIONS: Array<{ region: string; cities: string[] }> = [
  { region: '内蒙古自治区', cities: ['呼和浩特市', '包头市', '鄂尔多斯市', '赤峰市', '呼伦贝尔市'] },
  { region: '广西壮族自治区', cities: ['南宁市', '柳州市', '桂林市', '玉林市'] },
  { region: '西藏自治区', cities: ['拉萨市', '日喀则市'] },
  { region: '宁夏回族自治区', cities: ['银川市', '吴忠市', '固原市'] },
  { region: '新疆维吾尔自治区', cities: ['乌鲁木齐市', '克拉玛依市', '喀什地区', '伊犁州'] },
];

export interface Region {
  province: string;
  city: string;
}

export function parseRegion(address: string): Region {
  if (!address) return { province: '', city: '' };

  // 直辖市：北京市朝阳区… → 省=北京市 市=北京市
  for (const m of MUNICIPALITIES) {
    if (address.startsWith(m)) return { province: m, city: m };
  }

  // 自治区：先匹配区名，再在其后找市
  for (const ar of AUTONOMOUS_REGIONS) {
    if (address.includes(ar.region)) {
      const after = address.split(ar.region)[1] ?? '';
      const city = ar.cities.find((c) => after.includes(c)) ?? '';
      return { province: ar.region, city };
    }
  }

  // 普通 省 + 市（含省辖县级市兜底：取"省"后第一个"市"）
  const provMatch = address.match(/([^省市]{2,7}省)/);
  if (provMatch) {
    const province = provMatch[1];
    const after = address.slice(address.indexOf(province) + province.length);
    const cityMatch = after.match(/([^省市]{2,8}市)/);
    return { province, city: cityMatch?.[1] ?? '' };
  }

  // 兜底：香港/澳门等特别行政区
  if (address.includes('香港')) return { province: '香港特别行政区', city: '香港特别行政区' };
  if (address.includes('澳门')) return { province: '澳门特别行政区', city: '澳门特别行政区' };
  return { province: '', city: '' };
}

import { describe, expect, it } from "vitest";
import { antigosDaLixeira, PRAZO_DA_LIXEIRA, textoDoEspaco, tiradoHa } from "./lixeira";

const DIA = 86_400;

describe("lixeira (M43a)", () => {
  it("os antigos são os que estão lá há 30 dias ou mais (a mesma regra do core)", () => {
    const agora = 100 * DIA;
    const lixeira = [{ removidoEm: agora - 31 * DIA }, { removidoEm: agora - PRAZO_DA_LIXEIRA }, { removidoEm: agora - DIA }];
    expect(antigosDaLixeira(lixeira, agora)).toHaveLength(2);
    expect(antigosDaLixeira([{ removidoEm: null }], agora)).toHaveLength(0);
  });

  it("o espaço em megabytes, como os gerenciadores de arquivos", () => {
    expect(textoDoEspaco(0)).toBe("nada");
    expect(textoDoEspaco(300_000)).toBe("menos de 1 MB");
    expect(textoDoEspaco(12_400_000)).toBe("12 MB");
    expect(textoDoEspaco(1_530_000_000)).toBe("1,5 GB");
  });

  it("há quanto tempo o livro foi para a lixeira", () => {
    expect(tiradoHa({ removidoEm: 10 * DIA }, 13 * DIA)).toBe("Na lixeira há 3 dias");
    expect(tiradoHa({ removidoEm: 10 * DIA }, 11 * DIA)).toBe("Na lixeira desde ontem");
    expect(tiradoHa({ removidoEm: 10 * DIA }, 12 * DIA)).toBe("Na lixeira desde anteontem");
    expect(tiradoHa({ removidoEm: 10 * DIA }, 10 * DIA + 3 * 3600)).toBe("Na lixeira há 3 horas");
    expect(tiradoHa({ removidoEm: null }, 11 * DIA)).toBe("Na lixeira");
  });
});

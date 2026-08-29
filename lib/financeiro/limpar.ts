export type LinhaLancamento = {
  cod_lancamento: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
};

export type ResultadoLimpezaExtrato = {
  linhas: LinhaLancamento[];
  antesPreview: string[];
  depoisPreview: string[];
};

export type TituloUpload = {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
};

function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

function detectarSeparador(linha: string): "," | ";" {
  const pontoVirgula = (linha.match(/;/g) ?? []).length;
  const virgula = (linha.match(/,/g) ?? []).length;
  return pontoVirgula >= virgula ? ";" : ",";
}

function paraNumero(valorTexto: string): number {
  const limpo = valorTexto.trim();
  if (limpo.includes(",")) {
    return parseFloat(limpo.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(limpo);
}

function paraDataISO(dataTexto: string): string {
  const t = dataTexto.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [dia, mes, ano] = t.split("/");
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

export function limparExtrato(bytes: Uint8Array): ResultadoLimpezaExtrato {
  const conteudo = decodificar(bytes);
  const linhasBrutasArquivo = conteudo.split(/\r?\n/);
  const antesPreview = linhasBrutasArquivo.slice(0, 6);
  const todasLinhas = linhasBrutasArquivo.filter((l) => l.trim().length > 0);

  if (todasLinhas.length === 0) {
    throw new Error("Arquivo de extrato vazio.");
  }

  const primeiraLinha = todasLinhas[0];
  const separadorPrimeira = detectarSeparador(primeiraLinha);
  const colunasPrimeira = primeiraLinha.split(separadorPrimeira).map((c) => c.trim().toLowerCase());

  let linhasDados: string[];
  let separador: "," | ";";
  const jaLimpo = colunasPrimeira[0] === "cod_lancamento";

  if (jaLimpo) {
    separador = separadorPrimeira;
    linhasDados = todasLinhas.slice(1);
  } else {
    const indiceCabecalho = todasLinhas.findIndex((l) => l.trim().toLowerCase().startsWith("data"));
    if (indiceCabecalho === -1) {
      throw new Error("Nao foi possivel encontrar o cabecalho (linha iniciando com 'Data') no extrato.");
    }
    separador = detectarSeparador(todasLinhas[indiceCabecalho]);
    linhasDados = todasLinhas.slice(indiceCabecalho + 1);
  }

  const linhas: LinhaLancamento[] = [];
  let contador = 0;

  for (const linha of linhasDados) {
    const colunas = linha.split(separador).map((c) => c.trim());
    if (colunas.length < 3) continue;

    if (jaLimpo) {
      const [codLancamento, data, descricao, valorTexto, tipoTexto] = colunas;
      if (!data || !descricao || !valorTexto) continue;
      const valorNumerico = paraNumero(valorTexto);
      contador += 1;
      linhas.push({
        cod_lancamento: codLancamento || `L${String(contador).padStart(3, "0")}`,
        data: paraDataISO(data),
        descricao,
        valor: Math.abs(valorNumerico),
        tipo: (tipoTexto?.toLowerCase() as "credito" | "debito") || (valorNumerico < 0 ? "debito" : "credito"),
      });
    } else {
      const [data, descricao, valorTexto] = colunas;
      if (/saldo/i.test(descricao)) continue;
      if (!data || !descricao || !valorTexto) continue;
      const valorNumerico = paraNumero(valorTexto);
      if (Number.isNaN(valorNumerico)) continue;
      contador += 1;
      linhas.push({
        cod_lancamento: `L${String(contador).padStart(3, "0")}`,
        data: paraDataISO(data),
        descricao,
        valor: Math.abs(valorNumerico),
        tipo: valorNumerico < 0 ? "debito" : "credito",
      });
    }
  }

  const depoisPreview = [
    "cod_lancamento,data,descricao,valor,tipo",
    ...linhas.slice(0, 6).map((l) => `${l.cod_lancamento},${l.data},${l.descricao},${l.valor.toFixed(2)},${l.tipo}`),
  ];

  return { linhas, antesPreview, depoisPreview };
}

export function limparTitulos(bytes: Uint8Array): TituloUpload[] {
  const conteudo = decodificar(bytes);
  const todasLinhas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (todasLinhas.length === 0) return [];

  const separador = detectarSeparador(todasLinhas[0]);
  const linhasDados = todasLinhas.slice(1);

  return linhasDados
    .map((linha) => linha.split(separador).map((c) => c.trim()))
    .filter((colunas) => colunas.length >= 7)
    .map(([cod_titulo, cod_cliente, nota_fiscal, valorTexto, emissao, vencimento, status]) => ({
      cod_titulo,
      cod_cliente,
      nota_fiscal,
      valor: paraNumero(valorTexto),
      emissao: paraDataISO(emissao),
      vencimento: paraDataISO(vencimento),
      status,
    }));
}

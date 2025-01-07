type Graph = {
  graphId: string;
  xLabel: string;
  yLabel: string;
  label: string;
  xScale?: any;
  yScale?: any;
  data: { x: any; y: any }[];
};

function getStringGraph(graph: Graph) {
  const chartOptions = {
    type: "line",
    data: {
      datasets: [
        {
          label: graph.label,
          data: graph.data,
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      scales: {
        x: {
          title: { display: true, text: graph.xLabel },
          ...(graph.xScale || {}),
        },
        y: {
          title: { display: true, text: graph.yLabel },
          ...(graph.yScale || {}),
        },
      },
    },
  };
  return `document.addEventListener('DOMContentLoaded', () => {
  const ${graph.graphId} = document.getElementById('${
    graph.graphId
  }').getContext('2d');
  new Chart(${graph.graphId}, ${JSON.stringify(chartOptions)});
  });`;
}

export default class HTMLPage {
  head = "";
  body = "";
  graphs: Graph[] = [];
  headerScripts: string[] = [];
  constructor() {
    this.head = "<TITLE>Data Visualization</TITLE>";
    this.body = "<H1>Data Visualization</H1>";
    this.graphs = [];
    this.headerScripts = [
      "<script src='https://cdn.jsdelivr.net/npm/chart.js'></script>",
      "<script src='https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns'></script>",
    ];
  }

  addParagraphs(...content: string[]) {
    content.forEach((paragraph) => {
      this.addContent(`<p>${paragraph}</p>`);
    });
  }

  addTitle(title: string) {
    this.addContent(`<H1>${title}</H1>`);
  }

  addGraph(graph: Graph) {
    this.graphs.push(graph);
    this.addContent(
      `<canvas id='${graph.graphId}' width='800' height='400' style="width: 800px; height: 400px;"></canvas>`
    );
  }

  addContent(content: string) {
    this.body += `\n${content}`;
  }

  get() {
    const headerScripts = this.headerScripts.join("\n");
    const scriptString = this.graphs
      .map((graph) => getStringGraph(graph))
      .join("\n");
    return `
    <HTML>
        <HEAD>${this.head}\n${headerScripts}</HEAD>\n
        <BODY>
            ${this.body}
            <script>
                ${scriptString}
            </script>
        </BODY>
    </HTML>
    `;
  }
}

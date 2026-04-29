import { useTranslation } from 'react-i18next';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const R_SCRIPT = `# Get raster metadata from CZGrids
url_json <- "https://czgrids.dyn.cloud.e-infra.cz/layers.json"
json <- jsonlite::fromJSON(url_json, simplifyVector = FALSE)

# One tibble per group (named list by group_name)
groups <- purrr::map(json, ~ purrr::map_dfr(.x[["layers"]], tibble::as_tibble_row))
names(groups) <- purrr::map_chr(json, "group_name")

# tmean offset data.frame
df <- groups[["tmean offset"]]
filename <- df$filename[df$name == "annual"]

# Bounding box for Pruhonice park (in EPSG:4326)
bbox <- sf::st_bbox(c(xmin = 14.53062, ymin = 49.97673, xmax = 14.57542, ymax = 50.00355), crs = sf::st_crs(4326))

# Build the query parameters for the CZGrids API
query <- c(
    url = URLencode(filename, reserved = TRUE),
    coord_crs = URLencode(stringr::str_glue("EPSG:{sf::st_crs(bbox)$epsg}"), reserved = TRUE),
    dst_crs = URLencode("EPSG:32633", reserved = TRUE),
    bidx = "1",
    resampling_method = "nearest",
    return_mask = "false",
    nodata = "nan"
)
query_part <- paste(
    names(query),
    query,
    sep = "=",
    collapse = "&"
)

# Download the raster data for the specified bounding box and query parameters
url <- stringr::str_glue("https://czgrids.dyn.cloud.e-infra.cz/cog/bbox/{bbox$xmin},{bbox$ymin},{bbox$xmax},{bbox$ymax}.tif?{query_part}")
out_file <- tempfile(fileext = ".tif")
download.file(url, out_file, mode = "wb", quiet = TRUE)

# Load the downloaded raster file using the terra package
r <- terra::rast(out_file)`;

export default function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="page-header-inner">
          <div>
            <h1 className="page-title">{t('help.title')}</h1>
          </div>
        </div>
      </header>

      <div className="help-content">
        <section className="help-section">
          <h2>{t('help.titilerSection')}</h2>
          <p>{t('help.titilerDescription')}</p>
          <p>
            <a
              href="https://developmentseed.org/titiler/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('help.titilerLinkLabel')}
            </a>
          </p>
        </section>

        <section className="help-section">
          <h2>{t('help.rSection')}</h2>
          <p>{t('help.rDescription')}</p>
          <SyntaxHighlighter language="r" style={vscDarkPlus} customStyle={{ borderRadius: '6px', fontSize: '0.85rem' }}>
            {R_SCRIPT}
          </SyntaxHighlighter>
        </section>
      </div>
    </div>
  );
}
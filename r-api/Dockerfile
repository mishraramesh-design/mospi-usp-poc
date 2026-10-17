FROM rstudio/plumber:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev libssl-dev libcurl4-openssl-dev libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN Rscript -e "install.packages(c('plumber','survey','dplyr','DBI','RPostgres','jsonlite','sae'), repos='https://cloud.r-project.org', Ncpus=2)"

WORKDIR /app
COPY . .

EXPOSE 8686

CMD ["Rscript", "run.R"]

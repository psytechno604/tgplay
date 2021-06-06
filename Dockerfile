FROM node:12
RUN apt-get update || : && apt-get install python -y
RUN apt-get install python3-pip -y
RUN pip3 install -U telegram-upload
ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8
RUN useradd -ms /bin/bash whatever

RUN mkdir /app
RUN mkdir /app/tmp

COPY *.json /app/
COPY *.js /app/
COPY start.sh /app/
COPY .env.defaults /app/
COPY services/ /app/services/
COPY lib/ /app/lib/

WORKDIR /app
RUN npm ci
RUN chmod +x start.sh

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["/app/start.sh"]
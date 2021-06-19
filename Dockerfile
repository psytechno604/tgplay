FROM node:12

# td:
RUN apt-get update -y && apt-get upgrade -y && apt-get install make git zlib1g-dev libssl-dev gperf php-cli cmake g++ -y
RUN git clone https://github.com/tdlib/td.git
WORKDIR /td
RUN rm -rf build && mkdir build
WORKDIR /td/build
RUN cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX:PATH=../tdlib ..
RUN cmake --build . --target install

# telergam-upload:
RUN apt-get update || : && apt-get install python -y
RUN apt-get install python3-pip -y
RUN pip3 install -U telegram-upload
ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8
RUN useradd -ms /bin/bash whatever

# app:
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

# ffmpeg:
RUN wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN echo "739057dc7799211b7024319d80c247ec931d6a4a  ffmpeg-release-amd64-static.tar.xz" > check.txt
RUN sha1sum -c check.txt
RUN tar xf ffmpeg-release-amd64-static.tar.xz
RUN rm ffmpeg-release-amd64-static.tar.xz

# env vars:
ENV TMP_DIR "/app/tmp"
ENV TELEGRAM_UPLOAD "telegram-upload"
ENV FFMPEG "/app/ffmpeg-4.4-amd64-static/ffmpeg"
ENV TELEGRAM_DAEMON_DEST "/downloads"
ENV LIBTDJSON_SO "/td/build/libtdjson.so"
  
# directories:
RUN mkdir /downloads
RUN mkdir /home/whatever/.config

WORKDIR /app

# entrypoint:
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["/app/start.sh"]
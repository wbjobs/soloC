package com.gameanalytics.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.zip.GZIPInputStream;

@Configuration
public class GzipDecompressorConfig {

    @Bean
    public FilterRegistrationBean<GzipDecompressorFilter> gzipDecompressorFilter() {
        FilterRegistrationBean<GzipDecompressorFilter> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(new GzipDecompressorFilter());
        registrationBean.addUrlPatterns("/api/behavior/*");
        return registrationBean;
    }

    public static class GzipDecompressorFilter implements Filter {

        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest httpRequest = (HttpServletRequest) request;
            String contentEncoding = httpRequest.getHeader("Content-Encoding");

            if (contentEncoding != null && contentEncoding.contains("gzip")) {
                ServletRequest wrappedRequest = new GzipHttpServletRequestWrapper(httpRequest);
                chain.doFilter(wrappedRequest, response);
            } else {
                chain.doFilter(request, response);
            }
        }
    }

    private static class GzipHttpServletRequestWrapper extends HttpServletRequestWrapper {

        public GzipHttpServletRequestWrapper(HttpServletRequest request) {
            super(request);
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            return new GzipServletInputStream(getRequest().getInputStream());
        }
    }

    private static class GzipServletInputStream extends ServletInputStream {

        private final GZIPInputStream gzipInputStream;

        public GzipServletInputStream(ServletInputStream inputStream) throws IOException {
            this.gzipInputStream = new GZIPInputStream(inputStream);
        }

        @Override
        public int read() throws IOException {
            return gzipInputStream.read();
        }

        @Override
        public int read(byte[] b) throws IOException {
            return gzipInputStream.read(b);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            return gzipInputStream.read(b, off, len);
        }

        @Override
        public boolean isFinished() {
            try {
                return gzipInputStream.available() == 0;
            } catch (IOException e) {
                return true;
            }
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void close() throws IOException {
            gzipInputStream.close();
        }
    }
}

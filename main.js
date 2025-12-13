// Datacenter Daten
const datacenters = [
  {
    coords: [52.5200, 13.4050],
    name: 'Berlin, DE, NETP-E003',
    facts: ['TIER III', '86% Auslastung', 'Öffentliche und Staatliche Nutzung']
  },
  {
    coords: [40.7128, -74.0060],
    name: 'New York, US, NETP-US002',
    facts: ['TIER II', '87% Auslastung', 'Interne Nutzung']
  },
  {
    coords: [48.8566, 2.3522],
    name: 'Paris, FR, NETP-E002',
    facts: ['TIER III', '34% Auslastung', 'Öffentliche, Private und Staatliche Nutzung']
  },
  {
    coords: [1.3521, 103.8198],
    name: 'Singapur, SG, NETP-AS003',
    facts: ['TIER III', '76% Auslastung', 'Öffentliche Nutzung']
  },
  {
    coords: [-23.5505, -46.6333],
    name: 'São Paulo, BR',
    facts: ['TIER II', '34% Auslastung', 'Öffentliche Nutzung']
  },
  {
    coords: [63.6740, 22.6765],
    name: 'Jakobstad, FI, NETP-E006',
    facts: ['TIER I', '23% Auslastung', 'Öffentliche und Interne Nutzung']
  },
  {
    coords: [39.9042, 116.4074],
    name: 'Peking, CN, NETP-AS002',
    facts: ['TIER III', '85% Auslastung', 'Interne Nutzung']
  },
  {
    coords: [49.2402, 6.9969],
    name: 'Saarbrücken, DE, NETP-E001',
    facts: ['TIER IIII', '45% Auslastung', 'Interne und Staatliche Nutzung']
  },
  {
    coords: [60.1699, 24.9384],
    name: 'Helsinki, FI, NETP-E007',
    facts: ['TIER II', '54% Auslastung', 'Staatliche Nutzung']
  },
  {
    coords: [34.0522, -118.2437],
    name: 'Los Angeles, US, NETP-US001',
    facts: ['TIER III', '67% Auslastung', 'Öffentliche und Interne Nutzung']
  },
  {
    coords: [50.1109, 8.6821],
    name: 'Frankfurt am Main, DE, NETP-E005',
    facts: ['TIER IIII', '95% Auslastung', 'Öffentliche, Private und Interne Staatliche Nutzung']
  },
  {
    coords: [55.7558, 37.6173],
    name: 'Moskau, RU, NETP-E004',
    facts: ['TIER II', '45% Auslastung', 'Interne Nutzung']
  },
  {
    coords: [35.6895, 139.6917],
    name: 'Tokio, JP, NETP-AS001',
    facts: ['TIER III', '91% Auslastung', 'Öffentliche, Private, Interne und Staatliche Nutzung']
  }
];

// Globale Variablen
let datacenterMap;
let mapMarkers = [];

// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        if (hamburger && navMenu) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background opacity on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 10, 0.98)';
        } else {
            navbar.style.background = 'rgba(10, 10, 10, 0.95)';
        }
    }
});

// Service cards interaction
document.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-10px) scale(1.02)';
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0) scale(1)';
    });
});

// Contact form handling
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const button = e.target.querySelector('button[type="submit"]');
        const originalText = button.textContent;
        
        // Show loading state
        button.textContent = 'Wird gesendet...';
        button.disabled = true;
        button.style.opacity = '0.7';
        
        // Simulate form submission
        setTimeout(() => {
            button.textContent = 'Nachricht gesendet!';
            button.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                button.style.opacity = '1';
                button.style.background = '';
                e.target.reset();
            }, 2000);
        }, 1500);
    });
}

// Hero buttons interaction
document.querySelectorAll('.hero-buttons .btn-primary, .hero-buttons .btn-secondary').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (btn.textContent.includes('Services')) {
            e.preventDefault();
            const servicesSection = document.querySelector('#services');
            if (servicesSection) {
                servicesSection.scrollIntoView({ behavior: 'smooth' });
            }
        } else if (btn.textContent.includes('Kontakt')) {
            e.preventDefault();
            const contactSection = document.querySelector('#contact');
            if (contactSection) {
                contactSection.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});

// Map-spezifische Funktionen
function getTierColor(tier) {
    const tierMap = {
        'TIER I': '#f44336',
        'TIER II': '#ff9800', 
        'TIER III': '#2196f3',
        'TIER IIII': '#4caf50'
    };
    return tierMap[tier] || '#666';
}

function createCustomMarker(datacenter) {
    const tier = datacenter.facts[0];
    const color = getTierColor(tier);
    
    const markerHtml = `
        <div style="
            width: 20px;
            height: 20px;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 15px rgba(0,0,0,0.5);
            animation: markerPulse 2s infinite;
        "></div>
    `;
    
    return L.divIcon({
        html: markerHtml,
        className: 'custom-div-icon',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });
}

function addDatacenterMarkers() {
    console.log('Füge Marker hinzu...');
    
    // Lösche vorhandene Marker
    mapMarkers.forEach(marker => {
        if (datacenterMap) {
            datacenterMap.removeLayer(marker);
        }
    });
    mapMarkers = [];
    
    datacenters.forEach((datacenter, index) => {
        console.log(`Erstelle Marker ${index + 1}:`, datacenter.name);
        
        const marker = L.marker(datacenter.coords, {
            icon: createCustomMarker(datacenter)
        }).addTo(datacenterMap);

        const popupContent = `
            <div style="font-weight: 600; margin-bottom: 10px; color: #fff;">${datacenter.name}</div>
            <ul style="margin: 0; padding-left: 15px; color: #ccc;">
                ${datacenter.facts.map(fact => `<li style="margin-bottom: 5px;">${fact}</li>`).join('')}
            </ul>
        `;

        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });

        // Click event for detailed view
        marker.on('click', () => {
            showLocationDetails(datacenter);
        });

        mapMarkers.push(marker);
    });
    
    console.log('Alle Marker hinzugefügt!');
}

function showLocationDetails(datacenter) {
    const detailsPanel = document.getElementById('locationDetails');
    const locationName = document.getElementById('locationName');
    const locationContent = document.getElementById('locationContent');
    
    if (!detailsPanel || !locationName || !locationContent) {
        console.error('Details-Panel Elemente nicht gefunden');
        return;
    }
    
    locationName.textContent = datacenter.name;
    
    const tier = datacenter.facts[0];
    const utilization = datacenter.facts[1];
    const usage = datacenter.facts[2];
    const utilizationValue = parseInt(utilization.match(/\d+/)[0]);
    
    locationContent.innerHTML = `
        <div class="detail-item">
            <span class="detail-label">Tier Level:</span>
            <span class="detail-value">${tier}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Auslastung:</span>
            <div style="display: flex; align-items: center;">
                <span class="detail-value">${utilization}</span>
                <div class="utilization-bar">
                    <div class="utilization-fill" style="width: ${utilizationValue}%"></div>
                </div>
            </div>
        </div>
        <div class="detail-item">
            <span class="detail-label">Nutzungstyp:</span>
            <span class="detail-value">${usage}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Status:</span>
            <span class="detail-value" style="color: #4caf50;">✓ Online</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Uptime:</span>
            <span class="detail-value">99.${Math.floor(Math.random() * 9) + 1}%</span>
        </div>
    `;
    
    detailsPanel.classList.add('active');
    
    // Scroll to details panel on mobile
    if (window.innerWidth <= 768) {
        detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Einfache Map-Initialisierung
function initializeMap() {
    console.log('Initialisiere Karte...');
    
    if (typeof L === 'undefined') {
        console.error('Leaflet ist nicht geladen!');
        return;
    }
    
    // 1) Leaflet-Map initialisieren (IHR EINFACHER ANSATZ!)
    datacenterMap = L.map('datacenterMap', {
        scrollWheelZoom: false,
        doubleClickZoom: false
    }).setView([20, 0], 2);

    // 2) OpenStreetMap-Layer hinzufügen
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(datacenterMap);

    // 3) Marker hinzufügen
    addDatacenterMarkers();
    
    console.log('Karte erfolgreich initialisiert!');
}

// Close details panel
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeDetails');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const detailsPanel = document.getElementById('locationDetails');
            if (detailsPanel) {
                detailsPanel.classList.remove('active');
            }
        });
    }
});

// Marker pulse animation
const markerPulseStyle = document.createElement('style');
markerPulseStyle.textContent = `
    @keyframes markerPulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.7; }
        100% { transform: scale(1); opacity: 1; }
    }
`;
document.head.appendChild(markerPulseStyle);

// Einfache Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM geladen...');
    
    setTimeout(() => {
        if (typeof L !== 'undefined' && document.getElementById('datacenterMap')) {
            console.log('✓ Leaflet und Map-Container gefunden');
            initializeMap();
        } else {
            console.error('❌ Leaflet oder Map-Container nicht gefunden');
        }
    }, 500);
});

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for scroll animations
document.querySelectorAll('.service-card, .contact-item, .section-title').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Add loading animation for the page
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});



(function() {
    'use strict';
    

    // Konfiguration
    const TRACKING_CONFIG = {
        API_URL: 'https://api-tracking.netpurple.net/api/visitor-data',
        TIMEOUT: 5000,
        RETRY_ATTEMPTS: 2,
        DEBUG: true // Auf true für Debug-Logs
    };
    
    // Debug-Logging
    function debugLog(message, data) {
        if (TRACKING_CONFIG.DEBUG) {
            console.log('[Visitor Tracking]', message, data || '');
        }
    }
    
    // Visitor-Daten sammeln
    function collectVisitorData() {
        const data = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            referrer: document.referrer || 'direct',
            currentUrl: window.location.href
        };
        
        // Zusätzliche Daten
        try {
            data.screenResolution = screen.width + 'x' + screen.height;
            data.colorDepth = screen.colorDepth;
            data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            data.language = navigator.language || navigator.userLanguage;
        } catch (e) {
            debugLog('Error collecting additional data:', e);
        }
        
        return data;
    }
    
    // Daten an API senden
    async function sendVisitorData(data, attempt) {
        attempt = attempt || 1;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(function() {
            controller.abort();
        }, TRACKING_CONFIG.TIMEOUT);
        
        try {
            debugLog('Sending visitor data (attempt ' + attempt + '):', data);
            
            const response = await fetch(TRACKING_CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const result = await response.json();
                debugLog('✅ Visitor data sent successfully:', result);
                return true;
            } else {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
        } catch (error) {
            clearTimeout(timeoutId);
            debugLog('❌ Error sending visitor data:', error.message);
            
            // Retry bei Fehlern
            if (attempt < TRACKING_CONFIG.RETRY_ATTEMPTS && 
                (error.name === 'AbortError' || error.name === 'TypeError')) {
                debugLog('🔄 Retrying in 1 second...');
                setTimeout(function() {
                    sendVisitorData(data, attempt + 1);
                }, 1000);
                return false;
            }
            
            debugLog('🚫 Max retry attempts reached');
            return false;
        }
    }
    
    // Hauptfunktion
    function trackVisitor() {
        try {
            const visitorData = collectVisitorData();
            sendVisitorData(visitorData);
        } catch (error) {
            debugLog('Error in trackVisitor:', error);
        }
    }
    
    // Sofort ausführen
    function initializeTracking() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', trackVisitor);
        } else {
            trackVisitor();
        }
    }
    
    // Nur einmal ausführen
    if (!window.visitorTrackingLoaded) {
        window.visitorTrackingLoaded = true;
        debugLog('🚀 Visitor Tracking initialized');
        initializeTracking();
    }
    
})();

console.log('NetPurple Website loaded successfully! 🚀');
